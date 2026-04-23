import {
  AlertTriangle, ArrowRight, BarChart3, Clock,
  Files, FileText, Loader2, Plus, Trash2, TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteSession, getDashboardStats, getSessions } from "../api/analysisApi";
import ConfirmationModal from "../components/ConfirmationModal";

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    total_sessions: 0,
    total_documents: 0,
    high_risk_cases: 0,
    average_similarity: 0,
  });
  const [recentSessions, setRecentSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsData, sessionsData] = await Promise.all([
        getDashboardStats(),
        getSessions(),
      ]);
      setStats(statsData);
      const list = sessionsData.sessions || sessionsData || [];
      // Sort newest first, take top 3
      const sorted = [...list].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
      setRecentSessions(sorted.slice(0, 3));
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (e, session) => {
    e.stopPropagation();
    setSessionToDelete(session);
  };

  const confirmDelete = async () => {
    if (!sessionToDelete) return;
    setDeleting(true);
    try {
      await deleteSession(sessionToDelete.session_id);
      setSessionToDelete(null);
      loadData();
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1 text-sm">Overview of your document analyses</p>
        </div>
        <button
          onClick={() => navigate("/upload")}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 shadow-sm transition-all text-sm"
        >
          <Plus className="w-4 h-4" />
          New Analysis
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Analyses"
          value={stats.total_sessions}
          icon={<BarChart3 className="w-5 h-5" />}
          bgColor="bg-blue-100"
          iconColor="text-blue-600"
        />
        <StatCard
          title="Documents"
          value={stats.total_documents}
          icon={<Files className="w-5 h-5" />}
          bgColor="bg-purple-100"
          iconColor="text-purple-600"
        />
        <StatCard
          title="High Risk Cases"
          value={stats.high_risk_cases}
          icon={<AlertTriangle className="w-5 h-5" />}
          bgColor="bg-red-100"
          iconColor="text-red-600"
        />
        <StatCard
          title="Avg. Similarity"
          value={`${stats.average_similarity}%`}
          icon={<TrendingUp className="w-5 h-5" />}
          bgColor="bg-green-100"
          iconColor="text-green-600"
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">Quick Actions</h2>
          <div className="space-y-3">
            <ActionCard
              title="Upload New Assignments"
              description="Start a new similarity analysis"
              icon={<Plus className="w-5 h-5 text-white" />}
              bgColor="bg-blue-600"
              onClick={() => navigate("/upload")}
            />
            <ActionCard
              title="View Analysis History"
              description="Browse past analyses and results"
              icon={<Clock className="w-5 h-5 text-white" />}
              bgColor="bg-slate-700"
              // FIX: was "/history" which is not a registered route — correct route is "/results"
              onClick={() => navigate("/results")}
            />
          </div>
        </div>

        {/* Recent Analyses */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900">Recent Analyses</h2>
            <button
              onClick={() => navigate("/results")}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View All
            </button>
          </div>

          {recentSessions.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <FileText className="w-7 h-7 text-gray-400" />
              </div>
              <p className="text-gray-500 text-sm">No analyses yet</p>
              <button
                onClick={() => navigate("/upload")}
                className="mt-3 text-blue-600 hover:text-blue-700 font-medium text-sm"
              >
                Create your first analysis
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {recentSessions.map((session) => (
                <SessionCard
                  key={session.session_id}
                  session={session}
                  onClick={() => navigate(`/session/${session.session_id}`)}
                  onDelete={(e) => handleDeleteClick(e, session)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={!!sessionToDelete}
        title="Delete Session"
        message={`Delete the analysis for "${sessionToDelete?.subject}"? This will permanently remove all results and uploaded files.`}
        confirmText={deleting ? "Deleting..." : "Delete Permanently"}
        onConfirm={confirmDelete}
        onCancel={() => !deleting && setSessionToDelete(null)}
      />
    </div>
  );
}

function StatCard({ title, value, icon, bgColor, iconColor }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`${bgColor} ${iconColor} p-2.5 rounded-lg`}>{icon}</div>
      </div>
    </div>
  );
}

function ActionCard({ title, description, icon, bgColor, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-left group"
    >
      <div className={`w-10 h-10 ${bgColor} rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 text-sm">{title}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors shrink-0" />
    </button>
  );
}

function SessionCard({ session, onClick, onDelete }) {
  const statusColors = {
    COMPLETED: "bg-green-100 text-green-700",
    PROCESSING: "bg-blue-100 text-blue-700",
    FAILED: "bg-red-100 text-red-700",
  };
  const status = session.status || "COMPLETED";

  return (
    <div
      onClick={onClick}
      className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors text-sm truncate">
            {session.subject}
          </h3>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(session.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[status] || "bg-gray-100 text-gray-700"}`}>
            {status}
          </span>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}