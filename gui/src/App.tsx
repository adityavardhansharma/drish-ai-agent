
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { CommandPalette } from './components/CommandPalette';
import { EmailSummaries } from './pages/EmailSummaries';

function AppContent() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <main className="flex-1 overflow-hidden relative">
        <Routes>
          <Route path="/" element={<EmailSummaries />} />
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
