import { useEffect, useRef } from "react";

function HistorySection({
    history,
    loading,
    error,
    onSelect,
    onDelete,
    deletingId,
    activeId
}) {
    const sectionRef = useRef(null);

    // Subtle scroll entrance reveal using IntersectionObserver
    useEffect(() => {
        const rootElement = sectionRef.current;
        if (!rootElement) return;

        // Respect prefers-reduced-motion
        const prefersReducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches;

        const cards = rootElement.querySelectorAll(".history-card");
        if (prefersReducedMotion) {
            cards.forEach((card) => card.classList.add("is-visible"));
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                        observer.unobserve(entry.target);
                    }
                });
            },
            {
                root: null,
                rootMargin: "0px 0px -40px 0px",
                threshold: 0.15
            }
        );

        cards.forEach((card) => observer.observe(card));

        return () => {
            observer.disconnect();
        };
    }, [history]);

    const formatDomain = (rawUrl) => {
        try {
            const parsed = new URL(rawUrl);
            return parsed.hostname.replace(/^www\./, "");
        } catch {
            return rawUrl;
        }
    };

    const formatDate = (isoString) => {
        if (!isoString) return "";
        try {
            const date = new Date(isoString);
            return new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            }).format(date);
        } catch {
            return "";
        }
    };

    const getScoreTone = (score) => {
        if (typeof score !== "number") return "neutral";
        if (score >= 90) return "high";
        if (score >= 70) return "medium";
        return "low";
    };

    return (
        <section className="history-section" ref={sectionRef}>
            <div className="history-container">
                <div className="history-header">
                    <div>
                        <p className="eyebrow">SAVED SCANS / 02</p>
                        <h2 className="history-title">
                            YOUR RECENT
                            <br />
                            <span>SCANS.</span>
                        </h2>
                    </div>
                    <p className="history-subtitle">
                        Previously inspected websites, all in one place.
                    </p>
                </div>

                {loading ? (
                    <div className="history-state history-loading">
                        <div className="history-spinner" />
                        <span>Loading recent scans...</span>
                    </div>
                ) : error ? (
                    <div className="history-state history-error">
                        <p>{error}</p>
                    </div>
                ) : !history || history.length === 0 ? (
                    <div className="history-state history-empty">
                        <p className="history-empty-title">No scans saved yet.</p>
                        <p className="history-empty-desc">
                            Analyze a website above to automatically store your first audit report.
                        </p>
                    </div>
                ) : (
                    <div className="history-grid">
                        {history.map((item, index) => {
                            const domain = formatDomain(item.url);
                            const title = item.htmlInfo?.title;
                            const score = item.seo?.score;
                            const rating = item.seo?.rating || "N/A";
                            const issuesCount = Array.isArray(item.seo?.issues)
                                ? item.seo.issues.length
                                : 0;
                            const formattedDate = formatDate(item.createdAt);
                            const tone = getScoreTone(score);
                            const isDeleting = deletingId === item._id;
                            const isActive = activeId === item._id;

                            return (
                                <article
                                    key={item._id || index}
                                    className={`history-card ${isActive ? "active" : ""}`}
                                    style={{
                                        animationDelay: `${Math.min(index * 60, 400)}ms`
                                    }}
                                    onClick={() => onSelect(item._id)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            onSelect(item._id);
                                        }
                                    }}
                                >
                                    <div className="history-card-top">
                                        <div className="history-card-domain-wrap">
                                            <span className="history-card-domain">
                                                {domain}
                                            </span>
                                            {formattedDate && (
                                                <span className="history-card-date">
                                                    {formattedDate}
                                                </span>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            className="history-delete-btn"
                                            title="Delete scan"
                                            aria-label={`Delete scan for ${domain}`}
                                            disabled={isDeleting}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDelete(item._id, domain);
                                            }}
                                        >
                                            {isDeleting ? "…" : "×"}
                                        </button>
                                    </div>

                                    <p
                                        className="history-card-title"
                                        title={title || item.url}
                                    >
                                        {title || item.url}
                                    </p>

                                    <div className="history-card-footer">
                                        <div className="history-card-score-wrap">
                                            <span className={`history-card-score score-${tone}`}>
                                                {typeof score === "number" ? score : "—"}
                                            </span>
                                            <span className="history-card-rating">
                                                {rating}
                                            </span>
                                        </div>

                                        <div className="history-card-meta">
                                            <span className="history-card-issues">
                                                {issuesCount} {issuesCount === 1 ? "issue" : "issues"}
                                            </span>
                                            <span className="history-card-arrow">↗</span>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}

export default HistorySection;

