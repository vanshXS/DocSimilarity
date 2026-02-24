import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import Results from "./pages/Results"; // Single Session View
import DetailedComparison from "./pages/DetailedComparison";
import History from "./pages/History"; // List View

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<Upload />} />
          
          <Route path="/results" element={<History />} />
          
          {/* Specific Session Details (ID required) */}
          <Route path="/session/:sessionId" element={<Results />} />
          
          {/* Detailed Text Comparison */}
          <Route path="/comparison/:resultId" element={<DetailedComparison />} />
          
          {/* Catch legacy history link if any */}
          <Route path="/history" element={<Navigate to="/results" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;