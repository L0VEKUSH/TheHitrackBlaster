// src/pages/MatchesPage.jsx
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { matchAPI } from "../services/api";
import MatchCard from "../components/match/MatchCard";
import Spinner from "../components/common/Spinner";
import { EmptyState, PageHeader, TabBar } from "../components/common/Spinner";

const TABS = [
  { label: "Live",      value: "live"      },
  { label: "Upcoming",  value: "upcoming"  },
  { label: "Completed", value: "completed" },
];

export default function MatchesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const [total,   setTotal]   = useState(0);

  const status = searchParams.get("status") || "live";

  useEffect(() => {
    setLoading(true);
    setPage(1);
    matchAPI.getAll({ status, limit: 12, page: 1 })
      .then(({ data }) => { setMatches(data.matches || []); setTotal(data.total || 0); })
      .finally(() => setLoading(false));
  }, [status]);

  const loadMore = () => {
    const next = page + 1;
    matchAPI.getAll({ status, limit: 12, page: next })
      .then(({ data }) => { setMatches(p => [...p, ...(data.matches || [])]); setPage(next); });
  };

  return (
    <>
      <PageHeader title="Matches" sub="Live scores, schedules and results" />
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="mb-6">
          <TabBar tabs={TABS} active={status}
            onChange={v => setSearchParams({ status: v })} />
        </div>
        {loading
          ? <Spinner />
          : matches.length === 0
            ? <EmptyState icon="🏏" title={`No ${status} matches`} sub="Check back soon" />
            : <>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {matches.map(m => <MatchCard key={m._id} match={m} />)}
                </div>
                {matches.length < total && (
                  <div className="text-center mt-8">
                    <button onClick={loadMore} className="btn-ghost px-8">Load More</button>
                  </div>
                )}
              </>
        }
      </div>
    </>
  );
}
