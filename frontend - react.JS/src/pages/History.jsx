import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, Clock, Trash2, Loader2, FileText,
  Search, Filter, CheckSquare, Square, AlertCircle,
} from "lucide-react";
import ConfirmationModal from "../components/ConfirmationModal";
import { deleteMultipleSessions, deleteSession, getSessions } from "../api/analysisApi";

export default function History() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [filteredSessions, setFilteredSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  // Re-filter when search/filter changes
  useEffect(() => {
    let filtered = sessions;

    if (filterStatus !== "ALL") {
      filtered = filtered.filter((s) => s.status === filterStatus);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((s) => s.subject.toLowerCase().includes(q));
    }

    setFilteredSessions(filtered);
    // Reset selection when filters change
    setSelectedIds(new Set());
  }, [searchQuery, filterStatus, sessions]);

  const loadSessions = async () => {
    try {
      const data = await getSessions();
      const list = data.sessions || data || [];
      const sorted = [...list].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
      setSessions(sorted);
      setFilteredSessions(sorted);
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setError("Failed to load analysis history.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (e, id) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredSessions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSessions.map((s) => s.session_id)));
    }
  };

  const confirmDelete = async () => {
    if (!sessionToDelete) return;
    setDeleting(true);
    try {
      if (sessionToDelete === "BULK") {
        await deleteMultipleSessions(Array.from(selectedIds));
      } else {
        await deleteSession(sessionToDelete.session_id);
      }
      setSessionToDelete(null);
      setSelectedIds(new Set());
      await loadSessions();
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleting(false);
    }
  };

  const statusColor = (status) => {
    switch (status) {
      case "COMPLETED": return "bg-green-100 text-green-700 border-green-200";
      case "FAILED": return "bg-red-100 text-red-700 border-red-200";
      case "PROCESSING": return "bg-blue-100 text-blue-700 border-blue-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analysis History</h1>
        <p className="text-gray-500 mt-1 text-sm">Browse and manage past analyses.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-5">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by subject..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="relative min-w-[180px]">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <select
            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none appearance-none bg-white text-sm cursor-pointer"
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

      {error && (
        <div className="flex items-center gap-3 mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Bulk action bar */}
        {filteredSessions.length > 0 && (
          <div className={`px-5 py-3 border-b border-slate-200 flex items-center justify-between transition-colors ${
            selectedIds.size > 0 ? "bg-indigo-50" : "bg-slate-50"
          }`}>
            <div className="flex items-center gap-3">
              <button onClick={toggleSelectAll} className="text-slate-400 hover:text-indigo-600 transition-colors">
                {selectedIds.size === filteredSessions.length && filteredSessions.length > 0
                  ? <CheckSquare className="w-5 h-5 text-indigo-600" />
                  : <Square className="w-5 h-5" />
                }
              </button>
              <span className="text-sm font-semibold text-slate-600">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
              </span>
            </div>
            {selectedIds.size > 0 && (
              <button
                onClick={() => setSessionToDelete("BULK")}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-xs font-bold hover:bg-rose-100 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete {selectedIds.size} selected
              </button>
            )}
          </div>
        )}

        {filteredSessions.length === 0 ? (
          <div className="text-center py-16 px-6">
            <div className="bg-gray-100 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="font-semibold text-gray-800">No sessions found</h3>
            <p className="text-gray-400 text-sm mt-1">
              {searchQuery || filterStatus !== "ALL"
                ? "Try adjusting your search or filter."
                : "Start your first analysis."}
            </p>
            {!searchQuery && filterStatus === "ALL" && (
              <button
                onClick={() => navigate("/upload")}
                className="mt-4 px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                New Analysis
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredSessions.map((session) => (
              <div
                key={session.session_id}
                onClick={() => navigate(`/session/${session.session_id}`)}
                className={`group flex flex-col sm:flex-row sm:items-center justify-between p-5 hover:bg-slate-50 cursor-pointer transition-colors gap-3 ${
                  selectedIds.has(session.session_id) ? "bg-indigo-50/40" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => toggleSelection(e, session.session_id)}
                    className={`p-1 transition-colors shrink-0 ${
                      selectedIds.has(session.session_id)
                        ? "text-indigo-600"
                        : "text-slate-300 hover:text-slate-400"
                    }`}
                  >
                    {selectedIds.has(session.session_id)
                      ? <CheckSquare className="w-5 h-5" />
                      : <Square className="w-5 h-5" />
                    }
                  </button>

                  <div className={`p-2.5 rounded-xl shrink-0 ${
                    session.status === "COMPLETED"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}>
                    <FileText className="w-5 h-5" />
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                      {session.subject}
                    </h3>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                      {session.title && <span className="truncate max-w-[120px]">{session.title}</span>}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(session.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:shrink-0 sm:ml-auto">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${statusColor(session.status)}`}>
                    {session.status}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSessionToDelete(session); }}
                    className="p-2 text-gray-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer stats */}
      {sessions.length > 0 && (
        <div className="mt-5 flex gap-6 text-sm text-gray-400 justify-center">
          <span>Total: <b className="text-gray-700">{sessions.length}</b></span>
          <span>Completed: <b className="text-green-600">{sessions.filter((s) => s.status === "COMPLETED").length}</b></span>
          <span>Failed: <b className="text-red-500">{sessions.filter((s) => s.status === "FAILED").length}</b></span>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!sessionToDelete}
        title={sessionToDelete === "BULK" ? "Bulk Delete" : "Delete Analysis"}
        message={
          sessionToDelete === "BULK"
            ? `Permanently delete ${selectedIds.size} selected analyses? This cannot be undone.`
            : `Delete "${sessionToDelete?.subject}"? This cannot be undone.`
        }
        confirmText={deleting ? "Deleting..." : "Delete"}
        onConfirm={confirmDelete}
        onCancel={() => !deleting && setSessionToDelete(null)}
      />
    </div>
  );
}