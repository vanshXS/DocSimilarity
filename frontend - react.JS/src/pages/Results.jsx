import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getResults, checkSessionStatus } from "../api/analysisApi";
import {
  FileText,
  ArrowRight,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Calendar,
  BarChart,
} from "lucide-react";

export default function Results() {
  const navigate = useNavigate();
  const { sessionId } = useParams();

  const [results, setResults] = useState([]);
  const [sessionInfo, setSessionInfo] = useState({
    subject: "",
    title: "",
    date: "",
    status: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionId) {
      loadData(sessionId);
    } else {
      setError("Invalid Session ID.");
      setLoading(false);
    }
  }, [sessionId]);

  const loadData = async (id) => {
    try {
      const info = await checkSessionStatus(id);
      setSessionInfo({
        subject: info.subject || "Unknown Session",
        title: info.title,
        date: new Date(info.created_at).toLocaleDateString(),
        status: info.status,
      });

      const data = await getResults(id);
      const sortedResults = (data.results || []).sort(
        (a, b) => b.similarity_percentage - a.similarity_percentage
      );
      setResults(sortedResults);
    } catch (err) {
      console.error("Failed to load results:", err);
      setError("Failed to load analysis results. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (item) => {
    navigate(`/comparison/${item.result_id}`, {
      state: {
        resultId: item.result_id,
        fileA: item.file_a,
        fileB: item.file_b,
        overallScore: item.similarity_percentage,
        sessionId: sessionId,
      },
    });
  };

  const getScoreColor = (score) => {
    if (score >= 70) return "text-red-700 bg-red-50 border-red-200";
    if (score >= 40) return "text-orange-700 bg-orange-50 border-orange-200";
    return "text-green-700 bg-green-50 border-green-200";
  };

  const getScoreBadge = (score) => {
    if (score >= 70) return "HIGH RISK";
    if (score >= 40) return "MODERATE";
    return "LOW RISK";
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Loading results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* Back Button */}
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-6 transition-colors font-medium group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Back to Dashboard
      </button>

      {/* Session Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900 leading-tight">
                {sessionInfo.subject}
              </h1>
              <span className="bg-gray-100 text-gray-500 text-xs px-2 py-1 rounded-md font-mono border border-gray-200">
                {sessionId?.slice(0, 8)}
              </span>
            </div>
            
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-gray-500 text-sm">
              {sessionInfo.title && (
                <span className="font-medium text-gray-700 bg-gray-50 px-2 py-0.5 rounded">
                  {sessionInfo.title}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {sessionInfo.date}
              </span>
            </div>
          </div>

          <button
            onClick={() => navigate("/upload")}
            className="shrink-0 px-5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-all shadow-sm"
          >
            Start New Analysis
          </button>
        </div>

        {/* Summary Stats Row */}
        {results.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mt-8 pt-6 border-t border-gray-100">
            <div className="text-center md:text-left">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Total Comparisons
              </p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {results.length}
              </p>
            </div>
            <div className="text-center md:text-left">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                High Risk Cases
              </p>
              <p className="text-3xl font-bold text-red-600 mt-1">
                {results.filter((r) => r.similarity_percentage >= 70).length}
              </p>
            </div>
            <div className="col-span-2 md:col-span-1 text-center md:text-left border-t md:border-t-0 pt-4 md:pt-0 border-gray-100 md:border-l md:pl-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Avg. Similarity
              </p>
              <p className="text-3xl font-bold text-blue-600 mt-1">
                {results.length > 0
                  ? (
                      results.reduce(
                        (acc, r) => acc + r.similarity_percentage,
                        0
                      ) / results.length
                    ).toFixed(1)
                  : 0}
                %
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Results List */}
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700">
          <AlertCircle className="w-8 h-8 mx-auto mb-2" />
          <p className="font-medium">{error}</p>
        </div>
      ) : results.length === 0 ? (
        <div className="text-center p-16 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <FileText className="w-10 h-10 text-gray-300" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">
            No Similarities Found
          </h3>
          <p className="text-gray-500 mt-2 max-w-sm mx-auto">
            Great news! Comparisons were run, but no significant similarities were
            detected between the uploaded documents.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {results.map((item) => (
            <div
              key={item.result_id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all duration-200 group overflow-hidden"
            >
              <div className="p-5">
                <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                  
                  {/* COMPARISON GRID: Doc A - VS - Doc B */}
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center flex-1 w-full">
                    
                    {/* Document A */}
                    <div className="flex items-center gap-3 overflow-hidden p-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="shrink-0 p-2.5 bg-indigo-50 rounded-lg group-hover:bg-indigo-100 transition-colors">
                        <FileText className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate text-base" title={item.file_a.filename}>
                          {item.file_a.filename}
                        </p>
                        <p className="text-xs text-gray-500 font-medium">Document A</p>
                      </div>
                    </div>

                    {/* VS Badge */}
                    <div className="flex flex-col items-center justify-center">
                      <span className="hidden md:flex w-8 h-8 items-center justify-center rounded-full bg-gray-100 text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                        <ArrowRight className="w-4 h-4" />
                      </span>
                      <span className="md:hidden text-xs font-bold text-gray-400 my-1 bg-gray-100 px-2 py-0.5 rounded-full">VS</span>
                    </div>

                    {/* Document B */}
                    <div className="flex items-center gap-3 overflow-hidden md:justify-end md:text-right p-2 rounded-lg hover:bg-gray-50 transition-colors">
                      {/* Mobile: Icon first, Text second. Desktop: Text first, Icon second (via order) */}
                      <div className="min-w-0 order-2 md:order-1">
                        <p className="font-semibold text-gray-900 truncate text-base" title={item.file_b.filename}>
                          {item.file_b.filename}
                        </p>
                        <p className="text-xs text-gray-500 font-medium">Document B</p>
                      </div>
                      <div className="shrink-0 p-2.5 bg-purple-50 rounded-lg group-hover:bg-purple-100 transition-colors order-1 md:order-2">
                        <FileText className="w-5 h-5 text-purple-600" />
                      </div>
                    </div>
                  </div>

                  {/* SCORE & ACTION (Right Side) */}
                  <div className="flex items-center justify-between lg:justify-end gap-4 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-gray-100 lg:pl-6 lg:w-auto w-full">
                    <div className="text-left lg:text-center min-w-[80px]">
                      <div className={`inline-flex items-center justify-center w-full px-3 py-1 rounded-md border text-sm font-bold ${getScoreColor(item.similarity_percentage)}`}>
                        {item.similarity_percentage}%
                      </div>
                      <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wider pl-1 lg:pl-0 text-center">
                        {getScoreBadge(item.similarity_percentage)}
                      </p>
                    </div>

                    <button
                      onClick={() => handleViewDetails(item)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 shadow-sm hover:shadow transition-all whitespace-nowrap"
                    >
                      <BarChart className="w-4 h-4" />
                      <span className="hidden sm:inline">View Report</span>
                      <span className="sm:hidden">Report</span>
                    </button>
                  </div>

                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}