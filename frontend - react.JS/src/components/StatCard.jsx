export default function StatCard({ icon, value, label }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <div className="text-2xl mb-3">{icon}</div>
      <h2 className="text-2xl font-bold">{value}</h2>
      <p className="text-gray-500">{label}</p>
    </div>
  );
}
