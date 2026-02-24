import { NavLink } from "react-router-dom";

export default function Sidebar() {
  return (
    <div className="w-64 min-h-screen bg-slate-900 text-white p-6">
      <h2 className="text-2xl font-bold mb-10">Document Similarity</h2>

      <nav className="space-y-4">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `block px-4 py-2 rounded-lg ${
              isActive ? "bg-slate-700" : "hover:bg-slate-800"
            }`
          }
        >
          Dashboard
        </NavLink>

        <NavLink
          to="/upload"
          className={({ isActive }) =>
            `block px-4 py-2 rounded-lg ${
              isActive ? "bg-slate-700" : "hover:bg-slate-800"
            }`
          }
        >
          Upload
        </NavLink>

        <NavLink
          to="/results"
          className={({ isActive }) =>
            `block px-4 py-2 rounded-lg ${
              isActive ? "bg-slate-700" : "hover:bg-slate-800"
            }`
          }
        >
          Results
        </NavLink>
      </nav>
    </div>
  );
}
