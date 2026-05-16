
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { CommandPalette } from './components/CommandPalette';
import { EmailSummaries } from './pages/EmailSummaries';
import { Home } from './pages/Home';

function AppContent() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col font-sans">
      <main className="flex-1 overflow-hidden relative">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/emails" element={<EmailSummaries />} />
        </Routes>
      </main>
      <CommandPalette />
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
