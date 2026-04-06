import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Clock,
  Files,
  FileText,
  Loader2,
  Plus,
  TrendingUp
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDashboardStats, getSessions } from "../api/analysisApi";

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
      // Extract sessions array from response
      const sessionsList = sessionsData.sessions || sessionsData || [];
      setRecentSessions(sessionsList.slice(0, 3)); // Get 3 most recent
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-2">
            Welcome! Here's an overview of your document analysis
          </p>
        </div>
        <button
          onClick={() => navigate("/upload")}
          className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 shadow-sm transition-all"
        >
          <Plus className="w-5 h-5" />
          New Analysis
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Analyses"
          value={stats.total_sessions}
          icon={<BarChart3 className="w-6 h-6" />}
          bgColor="bg-blue-100"
          iconColor="text-blue-600"
        />
        <StatCard
          title="Documents Processed"
          value={stats.total_documents}
          icon={<Files className="w-6 h-6" />}
          bgColor="bg-purple-100"
          iconColor="text-purple-600"
        />
        <StatCard
          title="High Similarity Cases"
          value={stats.high_risk_cases}
          icon={<AlertTriangle className="w-6 h-6" />}
          bgColor="bg-red-100"
          iconColor="text-red-600"
        />
        <StatCard
          title="Avg. Similarity"
          value={`${stats.average_similarity}%`}
          icon={<TrendingUp className="w-6 h-6" />}
          bgColor="bg-green-100"
          iconColor="text-green-600"
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            Quick Actions
          </h2>
          <div className="space-y-4">
            <QuickActionCard
              title="Upload New Assignments"
              description="Start a new similarity analysis"
              icon={<Plus className="w-6 h-6 text-white" />}
              bgColor="bg-blue-600"
              onClick={() => navigate("/upload")}
            />
            <QuickActionCard
              title="View Analysis History"
              description="Browse past analyses and results"
              icon={<Clock className="w-6 h-6 text-white" />}
              bgColor="bg-gray-700"
              onClick={() => navigate("/results")}
            />
          </div>
        </div>

        {/* Recent Analyses */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Recent Analyses
            </h2>
            <button
              onClick={() => navigate("/history")}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View All
            </button>
          </div>

          {recentSessions.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500">No analyses yet</p>
              <button
                onClick={() => navigate("/upload")}
                className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
              >
                Create your first analysis
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {recentSessions.map((session) => (
                <RecentSessionCard
                  key={session.session_id}
                  session={session}
                  onClick={() => navigate(`/session/${session.session_id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, bgColor, iconColor }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`${bgColor} ${iconColor} p-3 rounded-lg`}>{icon}</div>
      </div>
    </div>
  );
}

function QuickActionCard({ title, description, icon, bgColor, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-left group"
    >
      <div
        className={`w-12 h-12 ${bgColor} rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform`}
      >
        {icon}
      </div>
      <div className="flex-1">
        <p className="font-medium text-gray-900">{title}</p>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
      <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
    </button>
  );
}

function RecentSessionCard({ session, onClick }) {
  const date = new Date(session.created_at).toLocaleDateString();
  const status = session.status || "COMPLETED";

  const statusColors = {
    COMPLETED: "bg-green-100 text-green-800",
    PROCESSING: "bg-blue-100 text-blue-800",
    FAILED: "bg-red-100 text-red-800",
  };

  return (
    <div
      onClick={onClick}
      className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
          {session.subject}
        </h3>
        <span
          className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[status] || "bg-gray-100 text-gray-800"
            }`}
        >
          {status}
        </span>
      </div>
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <span className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          {date}
        </span>
        <span className="flex items-center gap-1">
          <FileText className="w-4 h-4" />
          Session {session.session_id.slice(0, 8)}
        </span>
      </div>
    </div>
  );
}