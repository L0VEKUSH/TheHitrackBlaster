// src/pages/NewsDetailPage.jsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { newsAPI } from "../services/api";
import Spinner from "../components/common/Spinner";
import dayjs from "dayjs";

export default function NewsDetailPage() {
  const { id } = useParams();
  const [news, setNews] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    newsAPI.getById(id).then(({ data }) => setNews(data.news)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner size="lg" />;
  if (!news) return <div className="text-center py-16 text-gray-400">Article not found</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Link to="/news" className="text-brand-400 hover:underline">News</Link>
        <span className="text-gray-600">/</span>
        <span className="text-gray-400 capitalize">{news.category}</span>
      </div>
      {news.image && <img src={news.image} alt={news.title} className="w-full h-64 object-cover rounded-xl mb-6"/>}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-xs bg-brand-700 text-white px-2 py-0.5 rounded capitalize">{news.category}</span>
        {news.tags?.map(t => <span key={t} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">#{t}</span>)}
      </div>
      <h1 className="text-2xl font-extrabold text-white leading-tight mb-3">{news.title}</h1>
      <div className="flex items-center gap-3 text-sm text-gray-500 mb-6">
        <span>By {news.author}</span><span>·</span>
        <span>{dayjs(news.createdAt).format("ddd, D MMM YYYY")}</span><span>·</span>
        <span>{news.views} views</span>
      </div>
      {news.summary && (
        <p className="text-gray-300 text-base leading-relaxed border-l-4 border-brand-500 pl-4 mb-6 italic">{news.summary}</p>
      )}
      <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{news.content}</div>
    </div>
  );
}
