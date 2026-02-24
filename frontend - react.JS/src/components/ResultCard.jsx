const ResultCard = ({ result, onClick }) => {
  return (
    <div
      onClick={onClick}
      className="bg-white shadow-md rounded-xl p-6 cursor-pointer hover:shadow-xl transition"
    >
      <h3 className="font-semibold text-lg">
        {result.file_a.filename} vs {result.file_b.filename}
      </h3>
      <p className="mt-2 text-gray-600">
        Similarity: 
        <span className="font-bold text-indigo-600">
          {result.similarity_percentage}%
        </span>
      </p>
      <p className="text-sm text-gray-500">Level: {result.level}</p>
    </div>
  );
};

export default ResultCard;
