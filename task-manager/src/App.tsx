import { useState, useEffect } from 'react';
import ReviewPage from './pages/ReviewPage';
import ChorePage from './pages/ChorePage';
import MealPage from './pages/MealPage';
import WorkPage from './pages/WorkPage';
import DazeTimer from './components/DazeTimer';
import './App.css';

type Page = 'review' | 'chores' | 'meals' | 'work';

function App() {
  const [page, setPage] = useState<Page>(() => {
    const hash = window.location.hash.slice(1);
    if (hash === 'chores') return 'chores';
    if (hash === 'meals') return 'meals';
    if (hash === 'work') return 'work';
    return 'review';
  });

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.slice(1);
      if (hash === 'chores') setPage('chores');
      else if (hash === 'meals') setPage('meals');
      else if (hash === 'work') setPage('work');
      else setPage('review');
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const navigate = (p: Page) => {
    window.location.hash = p;
    setPage(p);
  };

  return (
    <div className="app">
      <nav className="page-nav">
        <button
          className={`page-tab ${page === 'review' ? 'active' : ''}`}
          onClick={() => navigate('review')}
        >
          📚 复习
        </button>
        <button
          className={`page-tab ${page === 'chores' ? 'active' : ''}`}
          onClick={() => navigate('chores')}
        >
          🏠 家务
        </button>
        <button
          className={`page-tab ${page === 'meals' ? 'active' : ''}`}
          onClick={() => navigate('meals')}
        >
          🍽️ 饮食
        </button>
        <button
          className={`page-tab ${page === 'work' ? 'active' : ''}`}
          onClick={() => navigate('work')}
        >
          💼 工作
        </button>
      </nav>

      {page === 'review' && <ReviewPage />}
      {page === 'chores' && <ChorePage />}
      {page === 'meals' && <MealPage />}
      {page === 'work' && <WorkPage />}

      <div className="timers-container">
        <DazeTimer storageKey="task-manager-daze" icon="😶‍🌫️" title="发呆/外散" />
        <DazeTimer storageKey="task-manager-thoughts" icon="💭" title="起心动念" resetOnStop />
        <DazeTimer storageKey="task-manager-pt" icon="🧘" title="PT计时器" resetOnStop />
        <DazeTimer storageKey="task-manager-interrupt" icon="🚨" title="被挟持/被打扰" resetOnStop />
      </div>
    </div>
  );
}

export default App;
