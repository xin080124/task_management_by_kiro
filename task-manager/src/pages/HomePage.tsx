type Page = 'review' | 'chores' | 'meals' | 'work' | 'projects' | 'listen';

interface HomeLink {
  page: Page;
  icon: string;
  title: string;
  desc: string;
}

const LINKS: HomeLink[] = [
  { page: 'review', icon: '📚', title: '复习', desc: '刷题 / 记忆卡片复习' },
  { page: 'chores', icon: '🏠', title: '家务', desc: '家务安排与计时' },
  { page: 'meals', icon: '🍽️', title: '饮食', desc: '一日三餐记录' },
  { page: 'work', icon: '💼', title: '工作', desc: '工作任务与时段' },
  { page: 'projects', icon: '🏡', title: '项目', desc: '家庭项目与里程碑' },
  { page: 'listen', icon: '👂', title: '听力', desc: '听力练习' },
];

interface HomePageProps {
  onNavigate: (page: Page) => void;
}

function HomePage({ onNavigate }: HomePageProps) {
  return (
    <div className="home-page">
      <header className="home-header">
        <h1>任务管理中心</h1>
        <p>选择一个模块开始</p>
      </header>
      <div className="home-grid">
        {LINKS.map((link) => (
          <a
            key={link.page}
            className="home-card"
            href={`#${link.page}`}
            onClick={(e) => {
              e.preventDefault();
              onNavigate(link.page);
            }}
          >
            <span className="home-card-icon">{link.icon}</span>
            <span className="home-card-title">{link.title}</span>
            <span className="home-card-desc">{link.desc}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export default HomePage;
