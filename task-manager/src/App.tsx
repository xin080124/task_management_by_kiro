import { useState, useEffect } from 'react';
import ReviewPage from './pages/ReviewPage';
import ChorePage from './pages/ChorePage';
import MealPage from './pages/MealPage';
import WorkPage from './pages/WorkPage';
import ProjectPage from './pages/ProjectPage';
import ListenPage from './pages/ListenPage';
import DistractionGate from './components/DistractionGate';
import './App.css';

type Page = 'review' | 'chores' | 'meals' | 'work' | 'projects' | 'listen';

function App() {
  const [page, setPage] = useState<Page>(() => {
    const hash = window.location.hash.slice(1);
    if (hash === 'chores') return 'chores';
    if (hash === 'meals') return 'meals';
    if (hash === 'work') return 'work';
    if (hash === 'projects') return 'projects';
    if (hash === 'listen') return 'listen';
    return 'review';
  });

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.slice(1);
      if (hash === 'chores') setPage('chores');
      else if (hash === 'meals') setPage('meals');
      else if (hash === 'work') setPage('work');
      else if (hash === 'projects') setPage('projects');
      else if (hash === 'listen') setPage('listen');
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
        <button
          className={`page-tab ${page === 'projects' ? 'active' : ''}`}
          onClick={() => navigate('projects')}
        >
          🏡 项目
        </button>
        <button
          className={`page-tab ${page === 'listen' ? 'active' : ''}`}
          onClick={() => navigate('listen')}
        >
          👂 听力
        </button>
      </nav>

      {page === 'review' && <ReviewPage />}
      {page === 'chores' && <ChorePage />}
      {page === 'meals' && <MealPage />}
      {page === 'work' && <WorkPage />}
      {page === 'projects' && <ProjectPage />}
      {page === 'listen' && <ListenPage />}

      <div className="timers-container">
        <DistractionGate />
      </div>
    </div>
  );
}

export default App;
