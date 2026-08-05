import type { Meal, MealTime } from '../types';

interface Props {
  meals: Meal[];
}

const MEAL_ORDER: MealTime[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS: Record<MealTime, string> = {
  breakfast: '🌅 早餐',
  lunch: '☀️ 午餐',
  dinner: '🌙 晚餐',
  snack: '🍪 加餐',
};

const COLORS = ['#007aff', '#ff9500', '#34c759', '#5856d6', '#ff3b30', '#af52de', '#00c7be', '#ff6482'];

export default function MealTimeline({ meals }: Props) {
  const todayStr = new Date().toISOString().slice(0, 10);

  // Show today's planned/active meals
  const todayMeals = meals.filter(m =>
    m.scheduledDate === todayStr && m.status !== 'done' && m.status !== 'skipped'
  );

  if (todayMeals.length === 0) return null;

  // Group by meal time
  const grouped: Record<MealTime, Meal[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  for (const m of todayMeals) {
    grouped[m.mealTime].push(m);
  }

  // Find max total prep for scaling
  const totals = MEAL_ORDER.map(mt => grouped[mt].reduce((s, m) => s + m.prepMinutes, 0));
  const maxTotal = Math.max(...totals, 1);

  let colorIdx = 0;

  return (
    <div className="meal-timeline-container">
      <div className="timeline-header">
        <h3>🍽️ 今日备餐时间</h3>
      </div>
      <div className="meal-timeline">
        {MEAL_ORDER.map(mt => {
          const items = grouped[mt];
          if (items.length === 0) return null;
          const total = items.reduce((s, m) => s + m.prepMinutes, 0);
          return (
            <div key={mt} className="meal-timeline-row">
              <span className="meal-timeline-label">{MEAL_LABELS[mt]}</span>
              <div className="meal-timeline-bars">
                {items.map(m => {
                  const width = (m.prepMinutes / maxTotal) * 100;
                  const color = COLORS[colorIdx++ % COLORS.length];
                  return (
                    <div
                      key={m.id}
                      className="meal-timeline-bar"
                      style={{ width: `${Math.max(width, 5)}%`, backgroundColor: color }}
                      title={`${m.dish} - ${m.prepMinutes}分钟`}
                    >
                      <span className="meal-bar-text">{m.dish} {m.prepMinutes}′</span>
                    </div>
                  );
                })}
              </div>
              <span className="meal-timeline-total">{total}分钟</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
