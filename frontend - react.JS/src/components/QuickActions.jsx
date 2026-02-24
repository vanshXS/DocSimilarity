import { Upload, FileText } from "lucide-react";

const QuickActions = () => {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <h3 className="font-semibold text-lg mb-4">Quick Actions</h3>

      <div className="space-y-3">
        <div className="flex items-center gap-4 p-4 rounded-lg bg-blue-50 cursor-pointer">
          <Upload className="text-blue-600" />
          <div>
            <p className="font-medium">Upload New Assignments</p>
            <p className="text-sm text-gray-500">
              Start a new similarity analysis
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 p-4 rounded-lg bg-gray-50 cursor-pointer">
          <FileText />
          <div>
            <p className="font-medium">View Recent Results</p>
            <p className="text-sm text-gray-500">
              Check latest analysis reports
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickActions;
