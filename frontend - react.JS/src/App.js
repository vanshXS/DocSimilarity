import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import DetailedComparison from "./pages/DetailedComparison";
import History from "./pages/History";
import Results from "./pages/Results";
import Upload from "./pages/Upload";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/results" element={<History />} />
          <Route path="/session/:sessionId" element={<Results />} />
          <Route
            path="/session/:sessionId/comparison/:pairId"
            element={<DetailedComparison />}
          />
          <Route path="/history" element={<Navigate to="/results" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
