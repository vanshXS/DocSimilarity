import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload as UploadIcon,
  FileText,
  CheckCircle,
  Loader2,
  X,
  AlertCircle,
} from "lucide-react";
import {
  createSession,
  uploadFiles,
  triggerAutoProcess,
  checkSessionStatus,
} from "../api/analysisApi";

export default function Upload() {
  const navigate = useNavigate();
  const [subject, setSubject] = useState("");
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState("IDLE"); // IDLE, UPLOADING, PROCESSING, COMPLETED
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const pollingRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles]);
      setError("");
      e.target.value = "";
    }
  };

  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const startAnalysis = async () => {
    if (!subject.trim()) {
      return setError("Please enter a subject/title for this analysis.");
    }
    if (files.length < 2) {
      return setError("Please upload at least 2 files to compare.");
    }

    setStatus("UPLOADING");
    setError("");
    setProgress("Creating session...");

    try {
      // Step 1: Create session
      const session = await createSession({ subject, title: "Auto Analysis" });
      
      // Step 2: Upload files
      setProgress("Uploading files...");
      await uploadFiles(session.session_id, files);
      
      // Step 3: Trigger processing
      setProgress("Starting analysis...");
      await triggerAutoProcess(session.session_id);

      setStatus("PROCESSING");
      setProgress("Analyzing documents...");

      // Step 4: Poll for completion
      pollingRef.current = setInterval(async () => {
        try {
          const statusRes = await checkSessionStatus(session.session_id);
          
          if (statusRes.status === "COMPLETED") {
            clearInterval(pollingRef.current);
            setStatus("COMPLETED");
            setProgress("Analysis complete!");
            setTimeout(() => navigate(`/session/${session.session_id}`), 1500);
          } else if (statusRes.status === "FAILED") {
            clearInterval(pollingRef.current);
            setError("Analysis failed. Please try again.");
            setStatus("IDLE");
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      }, 2000);
    } catch (err) {
      console.error("Analysis error:", err);
      setError(err.message || "Something went wrong. Please try again.");
      setStatus("IDLE");
    }
  };

  // Loading state
  if (status === "PROCESSING" || status === "UPLOADING") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh]">
        <div className="bg-white p-10 rounded-2xl shadow-lg border max-w-md w-full text-center">
          <Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {status === "UPLOADING" ? "Uploading..." : "Analyzing..."}
          </h2>
          <p className="text-gray-600 mb-4">{progress}</p>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full animate-pulse w-3/4"></div>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (status === "COMPLETED") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh]">
        <div className="bg-white p-10 rounded-2xl shadow-lg border border-green-100 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Analysis Complete!
          </h2>
          <p className="text-gray-600">Redirecting to results...</p>
        </div>
      </div>
    );
  }

  // Upload form
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">New Analysis</h1>
        <p className="text-gray-600 mt-2">
          Upload student assignments to detect plagiarism and similarity.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-8">
        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Subject Input */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Subject / Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g., Machine Learning Final Project"
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        {/* File Upload */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Upload Documents <span className="text-red-500">*</span>
          </label>
          <div className="border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors relative">
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.jpg,.jpeg,.png"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <UploadIcon className="w-10 h-10 text-blue-600 mb-4" />
              <p className="text-lg font-medium text-gray-900 mb-1">
                Click or Drag & Drop
              </p>
              <p className="text-sm text-gray-500">
                Supports PDF, DOCX, TXT, JPG, PNG (at least 2 files required)
              </p>
            </div>
          </div>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
            <p className="text-sm font-semibold text-gray-700 mb-3">
              {files.length} file{files.length > 1 ? "s" : ""} selected
            </p>
            <div className="space-y-2">
              {files.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-white p-3 rounded-md border border-gray-200"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-700 truncate">
                      {file.name}
                    </span>
                    <span className="text-xs text-gray-500">
                      ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <button
                    onClick={() => removeFile(idx)}
                    className="ml-2 p-1 hover:bg-red-50 rounded transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-400 hover:text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={startAnalysis}
            disabled={files.length < 2 || !subject.trim()}
            className="w-full py-4 rounded-xl text-white font-semibold text-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all"
          >
            Analyze Documents ({files.length} files)
          </button>
          <p className="text-xs text-gray-500 text-center mt-3">
            Analysis typically takes 30-60 seconds depending on file size
          </p>
        </div>
      </div>
    </div>
  );
}