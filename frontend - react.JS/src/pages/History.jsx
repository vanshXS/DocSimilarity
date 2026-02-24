import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSessions } from "../api/analysisApi";
import { 
  Loader2, 
  FileText, 
  Calendar, 
  Search,
  Filter,
  ArrowRight,
  Clock
} from "lucide-react";

export default function History() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [filteredSessions, setFilteredSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    filterAndSearchSessions();
  }, [searchQuery, filterStatus, sessions]);

  const loadSessions = async () => {
    try {
      const data = await getSessions();
      // Extract sessions array from response
      const sessionsList = data.sessions || data || [];
      // Sort by created_at descending (newest first)
      const sorted = sessionsList.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
      setSessions(sorted);
      setFilteredSessions(sorted);
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSearchSessions = () => {
    let filtered = sessions;

    // Filter by status
    if (filterStatus !== "ALL") {
      filtered = filtered.filter((s) => s.status === filterStatus);
    }

    // Search by subject
    if (searchQuery.trim()) {
      filtered = filtered.filter((s) =>
        s.subject.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredSessions(filtered);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'COMPLETED': return 'bg-green-100 text-green-700 border-green-200';
      case 'FAILED': return 'bg-red-100 text-red-700 border-red-200';
      case 'PROCESSING': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Analysis History</h1>
        <p className="text-gray-500 mt-1">
          Browse and manage your past plagiarism analyses.
        </p>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by subject..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-shadow"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Status Filter */}
        <div className="relative min-w-[200px]">
          <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <select
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none appearance-none bg-white cursor-pointer"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="ALL">All Status</option>
            <option value="COMPLETED">Completed</option>
            <option value="PROCESSING">Processing</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
      </div>

      {/* Sessions List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {filteredSessions.length === 0 ? (
          <div className="text-center py-20 px-6">
            <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No Sessions Found</h3>
            <p className="text-gray-500 mt-2">
              {searchQuery || filterStatus !== "ALL"
                ? "Try adjusting your filters or search query."
                : "You haven't run any analyses yet."}
            </p>
            {!searchQuery && filterStatus === "ALL" && (
              <button
                onClick={() => navigate("/upload")}
                className="mt-6 px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
              >
                Start New Analysis
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredSessions.map((session) => (
              <div
                key={session.session_id}
                onClick={() => navigate(`/session/${session.session_id}`)}
                className="group p-6 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors gap-4"
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl ${
                    session.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 text-lg transition-colors">
                      {session.subject}
                    </h3>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-1 text-sm text-gray-500">
                      {session.title && <span>{session.title}</span>}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> 
                        {new Date(session.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(session.status)}`}>
                    {session.status}
                  </span>
                  <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats Footer */}
      {sessions.length > 0 && (
        <div className="mt-6 grid grid-cols-3 gap-4 text-center text-sm text-gray-500">
          <p>Total: <span className="font-medium text-gray-900">{sessions.length}</span></p>
          <p>Completed: <span className="font-medium text-green-600">{sessions.filter(s => s.status === 'COMPLETED').length}</span></p>
          <p>Processing: <span className="font-medium text-blue-600">{sessions.filter(s => s.status === 'PROCESSING').length}</span></p>
        </div>
      )}
    </div>
  );
}