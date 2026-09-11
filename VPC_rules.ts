// ========================================
// 第一步：最底层的数据结构
// ========================================

class IPRange {
  baseIP: string;    // "10.0.0.0"
  prefixLength: number;  // 16 means /16

  contains(ip: string): boolean {
    // 判断一个 IP 是否在这个范围内
    // 10.0.0.0/16 contains 10.0.1.50 → true
    // 10.0.0.0/16 contains 192.168.1.1 → false
  }

  overlaps(other: IPRange): boolean {
    // 两个范围是否有重叠
  }
}

class ElasticIP {
  address: string;   // "54.200.1.1" — AWS 从公有 IP 池里分配给你的
  allocated: boolean;
  associatedTo: string | null;  // 关联到哪个资源

  constructor() {
    this.address = AWSPublicIPPool.allocate();  // AWS 给你一个固定公有 IP
    this.allocated = true;
    this.associatedTo = null;
  }
}

// ========================================
// 第二步：VPC — 一切的起点
// ========================================

class VPC {
  id: string;
  cidrBlock: IPRange;       // 整个 VPC 的 IP 空间
  subnets: Subnet[] = [];
  mainRouteTable: RouteTable;
  internetGateway: InternetGateway | null = null;

  constructor(cidr: string) {
    this.id = generateId("vpc");
    this.cidrBlock = new IPRange(cidr);  // 比如 "10.0.0.0/16"

    // VPC 创建时自动生成一个主路由表
    this.mainRouteTable = new RouteTable(this);
  }
}

// ========================================
// 第三步：Route（单条路由规则）和 RouteTable
// ========================================

interface Route {
  destination: string;   // "0.0.0.0/0" 或 "10.0.0.0/16"
  target: string;        // "local" | "igw-xxx" | "nat-xxx" | "tgw-xxx"
}

class RouteTable {
  id: string;
  vpc: VPC;
  routes: Route[];

  constructor(vpc: VPC) {
    this.id = generateId("rtb");
    this.vpc = vpc;

    // 创建时自动加一条不可删除的 local 路由
    // 意思：VPC 内部的 IP 互相直接通信，不用出去
    this.routes = [
      { destination: vpc.cidrBlock.toString(), target: "local" }
    ];
  }

  addRoute(destination: string, target: { id: string }) {
    // 加一条路由规则
    this.routes.push({ destination, target: target.id });
  }
}

// ========================================
// 第四步：Subnet — 从 VPC 中划出一小块
// ========================================

class Subnet {
  id: string;
  vpc: VPC;
  cidrBlock: IPRange;
  availabilityZone: string;
  routeTable: RouteTable;    // 决定这个 subnet 里的流量怎么走
  availableIPs: string[];    // 这个范围里还没被用的 IP

  constructor(props: {
    vpc: VPC;
    cidr: string;           // 比如 "10.0.1.0/24"（256 个 IP）
    az: string;             // 比如 "ap-southeast-2a"
  }) {
    this.id = generateId("subnet");
    this.vpc = props.vpc;
    this.cidrBlock = new IPRange(props.cidr);
    this.availabilityZone = props.az;

    // 验证：必须在 VPC 范围内
    if (!props.vpc.cidrBlock.contains(this.cidrBlock)) {
      throw new Error("Subnet CIDR must be within VPC CIDR");
    }

    // 验证：不能和已有 subnet 重叠
    for (const existing of props.vpc.subnets) {
      if (existing.cidrBlock.overlaps(this.cidrBlock)) {
        throw new Error("Subnet CIDR overlaps with existing subnet");
      }
    }

    // 默认用 VPC 的主路由表（可以后面换）
    this.routeTable = props.vpc.mainRouteTable;

    // 生成可用 IP 列表（AWS 会预留前 4 个和最后 1 个）
    this.availableIPs = generateIPs(props.cidr).slice(4, -1);

    // 注册到 VPC
    props.vpc.subnets.push(this);
  }

  associateRouteTable(rt: RouteTable) {
    this.routeTable = rt;
  }

  allocateIP(): string {
    // 从可用池里取一个 IP 给 ENI 用
    return this.availableIPs.shift()!;
  }
}

// ========================================
// 第五步：InternetGateway — VPC 的大门
// ========================================

class InternetGateway {
  id: string;
  attachedVpc: VPC | null = null;

  // NAT 映射表：公有IP ↔ 私有IP
  natTable: Map<string, string> = new Map();

  constructor() {
    this.id = generateId("igw");
  }

  attachToVpc(vpc: VPC) {
    this.attachedVpc = vpc;
    vpc.internetGateway = this;
  }

  // 出站：私有 IP → 公有 IP
  translateOutbound(packet: IPPacket, publicIP: string): IPPacket {
    this.natTable.set(publicIP, packet.sourceIP);  // 记住映射
    packet.sourceIP = publicIP;
    return packet;
  }

  // 入站：公有 IP → 私有 IP
  translateInbound(packet: IPPacket): IPPacket {
    const privateIP = this.natTable.get(packet.destinationIP);
    packet.destinationIP = privateIP!;
    return packet;
  }
}

// ========================================
// 第六步：NATGateway — 私有 subnet 的代理人
// ========================================

class NATGateway {
  id: string;
  subnet: Subnet;           // 它住在哪个 subnet
  elasticIp: ElasticIP;     // 它的公有身份
  eni: ENI;                 // 它自己的网卡

  // 连接跟踪表：记住谁的包经过我，回来时还给谁
  connectionTable: Map<string, { originalSourceIP: string; originalSourcePort: number }> = new Map();

  constructor(props: { subnet: Subnet; eip: ElasticIP }) {
    this.id = generateId("nat");
    this.subnet = props.subnet;
    this.elasticIp = props.eip;

    // 验证：所在 subnet 必须有 IGW 路由，否则自己也出不去
    const hasIGWRoute = props.subnet.routeTable.routes.some(
      r => r.destination === "0.0.0.0/0" && r.target.startsWith("igw-")
    );
    if (!hasIGWRoute) {
      throw new Error("NAT Gateway must be in a subnet with IGW route");
    }

    // 在该 subnet 里分配一个内网 IP 给自己
    this.eni = new ENI({ subnet: props.subnet });

    // 把 EIP 关联到自己
    props.eip.associatedTo = this.id;
  }

  // 处理出站流量
  handleOutbound(packet: IPPacket): IPPacket {
    // 记住原始信息，回来时要还原
    const key = `${packet.sourceIP}:${packet.sourcePort}`;
    this.connectionTable.set(key, {
      originalSourceIP: packet.sourceIP,
      originalSourcePort: packet.sourcePort,
    });

    // 替换源 IP 为我的 EIP
    packet.sourceIP = this.elasticIp.address;
    return packet;
    // 然后这个包继续走我所在 subnet 的路由表 → 到 IGW → 出去
  }

  // 处理入站响应
  handleInbound(packet: IPPacket): IPPacket {
    // 查连接表，还原目标 IP
    const key = `${packet.destinationIP}:${packet.destinationPort}`;
    const original = this.connectionTable.get(key)!;
    packet.destinationIP = original.originalSourceIP;
    return packet;
    // 然后转发回 private subnet 的实例
  }
}

// ========================================
// 第七步：ENI — 虚拟网卡（实例的网络接口）
// ========================================

class ENI {
  id: string;
  subnetId: string;
  privateIP: string;         // 从 subnet 分配的内网 IP
  publicIP: string | null;   // 可选的公有 IP
  securityGroups: SecurityGroup[];

  constructor(props: { subnet: Subnet }) {
    this.id = generateId("eni");
    this.subnetId = props.subnet.id;
    this.privateIP = props.subnet.allocateIP();  // 从 subnet 拿一个 IP
    this.publicIP = null;
    this.securityGroups = [];
  }
}

// ========================================
// 第八步：SecurityGroup — 端口级别的防火墙
// ========================================

class SecurityGroup {
  id: string;
  inboundRules: SGRule[] = [];
  outboundRules: SGRule[] = [];

  constructor() {
    this.id = generateId("sg");
    // 默认：出站全放行，入站全拒绝
    this.outboundRules = [{ protocol: "all", port: "all", source: "0.0.0.0/0" }];
  }

  allowInbound(protocol: string, port: number, source: string) {
    this.inboundRules.push({ protocol, port: port.toString(), source });
  }
}

interface SGRule {
  protocol: string;  // "tcp" | "udp" | "all"
  port: string;      // "443" | "all"
  source: string;    // "0.0.0.0/0" | "10.0.1.0/24" | "sg-xxx"
}

// ========================================
// 第九步：数据包转发引擎（跑在 Nitro 上）
// ========================================

interface IPPacket {
  sourceIP: string;
  sourcePort: number;
  destinationIP: string;
  destinationPort: number;
  payload: Buffer;
}

class NitroForwardingEngine {
  // 这段逻辑跑在每台物理宿主机的 Nitro 芯片上

  forward(packet: IPPacket, sourceENI: ENI) {
    const subnet = getSubnetById(sourceENI.subnetId);
    const routeTable = subnet.routeTable;

    // 1. 检查 Security Group 出站规则
    if (!this.checkOutboundSG(sourceENI, packet)) {
      drop(packet);  // 安全组不允许，丢弃
      return;
    }

    // 2. 路由匹配（最长前缀匹配）
    const matchedRoute = this.longestPrefixMatch(routeTable.routes, packet.destinationIP);

    // 3. 根据 target 类型处理
    switch (matchedRoute.target) {
      case "local":
        // 目标在 VPC 内，找到目标 ENI 直接转发
        const targetENI = findENIByIP(packet.destinationIP);
        if (this.checkInboundSG(targetENI, packet)) {
          deliver(packet, targetENI);
        }
        break;

      case matchedRoute.target.startsWith("nat-"):
        // 交给 NAT Gateway 处理
        const natGW = getNATGateway(matchedRoute.target);
        const translated = natGW.handleOutbound(packet);
        // 用 NAT GW 的 ENI 重新走一遍路由（会命中 IGW 路由）
        this.forward(translated, natGW.eni);
        break;

      case matchedRoute.target.startsWith("igw-"):
        // 交给 IGW 发出互联网
        const igw = getIGW(matchedRoute.target);
        const publicIP = getPublicIP(sourceENI);  // EIP 或 NAT GW 的 EIP
        const outbound = igw.translateOutbound(packet, publicIP);
        sendToInternet(outbound);
        break;
    }
  }

  longestPrefixMatch(routes: Route[], destIP: string): Route {
    // 找最具体的匹配规则
    // 比如 10.0.1.0/24 比 10.0.0.0/16 更具体，比 0.0.0.0/0 更具体
    return routes
      .filter(r => new IPRange(r.destination).contains(destIP))
      .sort((a, b) => prefixLength(b.destination) - prefixLength(a.destination))
      [0];
  }
}

// ========================================
// 第十步：完整建网过程（按顺序执行）
// ========================================

// 1. 创建 VPC
const vpc = new VPC("10.0.0.0/16");

// 2. 创建 IGW 并挂到 VPC
const igw = new InternetGateway();
igw.attachToVpc(vpc);

// 3. 创建 egress subnet（将来放 NAT GW）
const egressSubnet = new Subnet({ vpc, cidr: "10.0.0.0/24", az: "ap-southeast-2a" });

// 4. 给 egress subnet 创建路由表，加 IGW 路由
const egressRT = new RouteTable(vpc);
egressRT.addRoute("0.0.0.0/0", igw);    // 所有外部流量走 IGW
egressSubnet.associateRouteTable(egressRT);

// 5. 创建 EIP
const eip = new ElasticIP();  // 拿到比如 "54.200.1.1"

// 6. 在 egress subnet 里创建 NAT Gateway
const natGW = new NATGateway({ subnet: egressSubnet, eip });

// 7. 创建 private subnet（放业务）
const privateSubnet = new Subnet({ vpc, cidr: "10.0.1.0/24", az: "ap-southeast-2a" });

// 8. 给 private subnet 创建路由表，指向 NAT GW
const privateRT = new RouteTable(vpc);
privateRT.addRoute("0.0.0.0/0", natGW);  // 所有外部流量走 NAT GW
privateSubnet.associateRouteTable(privateRT);

// 9. 在 private subnet 里启动一个 Lambda / EC2
const lambdaENI = new ENI({ subnet: privateSubnet });  // 拿到 IP 10.0.1.5

// 10. 现在 Lambda 发一个包到 Stripe
const packet: IPPacket = {
  sourceIP: "10.0.1.5",
  sourcePort: 52341,
  destinationIP: "52.18.63.100",  // stripe
  destinationPort: 443,
  payload: Buffer.from("GET /v1/charges ..."),
};

// Nitro 引擎处理这个包
const engine = new NitroForwardingEngine();
engine.forward(packet, lambdaENI);
// → 路由匹配 0.0.0.0/0 → nat-xxx
// → NAT GW 把源 IP 换成 54.200.1.1
// → 再走 egress subnet 路由 → 0.0.0.0/0 → igw-xxx
// → IGW 发到互联网
// → Stripe 收到，回复到 54.200.1.1
// → IGW 收到 → NAT GW 还原 → 10.0.1.5 → Lambda 收到响应
