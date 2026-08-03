import { useState, useEffect } from 'react';
import ReviewPage from './pages/ReviewPage';
import ChorePage from './pages/ChorePage';
import './App.css';

type Page = 'review' | 'chores';

function App() {
  const [page, setPage] = useState<Page>(() => {
    const hash = window.location.hash.slice(1);
    return hash === 'chores' ? 'chores' : 'review';
  });

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.slice(1);
      setPage(hash === 'chores' ? 'chores' : 'review');
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
      </nav>

      {page === 'review' && <ReviewPage />}
      {page === 'chores' && <ChorePage />}
    </div>
  );
}

export default App;
