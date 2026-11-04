console.log("API URL:", import.meta.env.VITE_API_URL);

import { useState, useEffect, useCallback } from "react";
import CursorGlow from "./components/CursorGlow";
import Magnetic from "./components/Magnetic";
import BackgroundGrid from "./components/BackgroundGrid";
import AnalysisLoader from "./components/AnalysisLoader";
import HistorySection from "./components/HistorySection";

const API_BASE = import.meta.env.VITE_API_URL;

async function safeFetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();

    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            // Non-JSON response (e.g., HTML 404/504 gateway timeout from Vercel)
            const snippet = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
            throw new Error(
                snippet
                    ? `Server returned HTTP ${response.status}: ${snippet}`
                    : `Server returned HTTP ${response.status} with invalid JSON.`
            );
        }
    }

    if (!response.ok) {
        const errorMsg =
            data?.message ||
            data?.error ||
            `Request failed with status ${response.status}`;
        throw new Error(errorMsg);
    }

    return data;
}

function App() {
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [view, setView] = useState("seo");
    const [error, setError] = useState("");

    // History state
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState("");
    const [deletingId, setDeletingId] = useState(null);
    const [fetchingHistoryId, setFetchingHistoryId] = useState(null);

    const fetchHistory = useCallback(async () => {
        setHistoryLoading(true);
        setHistoryError("");

        try {
            const data = await safeFetchJson(`${API_BASE}/api/history`);
            setHistory(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Fetch history error:", err);
            setHistoryError(err.message || "Failed to load scan history.");
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    const analyzeWebsite = async (selectedView) => {
        if (!url.trim()) {
            setError("Enter a website URL first.");
            return;
        }

        let targetUrl = url.trim();

        if (
            !targetUrl.startsWith("http://") &&
            !targetUrl.startsWith("https://")
        ) {
            targetUrl = `https://${targetUrl}`;
        }

        setView(selectedView);
        setLoading(true);
        setError("");
        setResults(null);

        try {
            const data = await safeFetchJson(
                `${API_BASE}/api/analyze`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        url: targetUrl
                    })
                }
            );

            setResults(data);
            // Refresh history so the newly saved scan appears immediately
            fetchHistory();
        } catch (error) {
            console.error("Analysis error:", error);
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectHistory = async (id) => {
        setFetchingHistoryId(id);
        setError("");

        try {
            const data = await safeFetchJson(`${API_BASE}/api/history/${id}`);
            setResults(data);
            // Scroll smoothly to top so results are in view
            window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (err) {
            console.error("Load history scan error:", err);
            setError(err.message || "Failed to retrieve scan details.");
        } finally {
            setFetchingHistoryId(null);
        }
    };

    const handleDeleteHistory = async (id, domain) => {
        const confirmed = window.confirm(
            `Delete saved analysis for ${domain || "this website"}?`
        );
        if (!confirmed) return;

        setDeletingId(id);

        try {
            await safeFetchJson(`${API_BASE}/api/history/${id}`, {
                method: "DELETE"
            });

            // Optimistically or state-based update list
            setHistory((prev) => prev.filter((item) => item._id !== id));
        } catch (err) {
            console.error("Delete history error:", err);
            alert(`Could not delete scan: ${err.message}`);
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <main className="app">
            <BackgroundGrid />
            <CursorGlow />

            {loading ? (
                <AnalysisLoader url={url} />
            ) : !results ? (
                <>
                    <section className="hero">
                        <p className="eyebrow">
                            WEB INTELLIGENCE / 01
                        </p>

                        <h1>
                            SEE WHAT'S
                            <br />
                            <span>BEHIND THE LINK.</span>
                        </h1>

                        <p className="subtitle">
                            Inspect the structure and SEO health
                            of any website.
                        </p>

                        <div className="url-box">
                            <input
                                type="text"
                                value={url}
                                onChange={(event) =>
                                    setUrl(event.target.value)
                                }
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        analyzeWebsite("seo");
                                    }
                                }}
                                placeholder="https://example.com"
                                disabled={loading}
                            />
                        </div>

                        <div className="analysis-options">
                            <Magnetic strength={0.12}>
                                <button
                                    className="analysis-option html-option"
                                    onClick={() =>
                                        analyzeWebsite("html")
                                    }
                                >
                                    <span className="option-number">
                                        01
                                    </span>

                                    <span className="option-content">
                                        <strong>HTML INFO</strong>
                                        <small>
                                            Inspect page structure,
                                            links, assets & metadata
                                        </small>
                                    </span>

                                    <span className="option-arrow">
                                        ↗
                                    </span>
                                </button>
                            </Magnetic>

                            <Magnetic strength={0.12}>
                                <button
                                    className="analysis-option seo-option"
                                    onClick={() =>
                                        analyzeWebsite("seo")
                                    }
                                >
                                    <span className="option-number">
                                        02
                                    </span>

                                    <span className="option-content">
                                        <strong>SEO ANALYSIS</strong>
                                        <small>
                                            Check SEO health, issues
                                            & optimization
                                        </small>
                                    </span>

                                    <span className="option-arrow">
                                        ↗
                                    </span>
                                </button>
                            </Magnetic>
                        </div>

                        {error && (
                            <p className="error-message">
                                {error}
                            </p>
                        )}
                    </section>

                    <HistorySection
                        history={history}
                        loading={historyLoading}
                        error={historyError}
                        onSelect={handleSelectHistory}
                        onDelete={handleDeleteHistory}
                        deletingId={deletingId}
                        activeId={fetchingHistoryId}
                    />
                </>
            ) : (
                <Results
                    data={results}
                    view={view}
                    setView={setView}
                    onBack={() => {
                        setResults(null);
                        // Refresh history when navigating back to landing
                        fetchHistory();
                    }}
                />
            )}
        </main>
    );
}


function Results({ data, view, setView, onBack }) {
    return (
        <section className="results-page">
            <div className="results-header">
                <button
                    className="back-button"
                    onClick={onBack}
                >
                    ← Analyze another
                </button>

                <div>
                    <p className="eyebrow">
                        LINKLENS / ANALYSIS
                    </p>

                    <h2>{data.url}</h2>
                </div>
            </div>

            <div className="result-tabs">
                <button
                    className={view === "html" ? "active" : ""}
                    onClick={() => setView("html")}
                >
                    HTML INFO
                </button>

                <button
                    className={view === "seo" ? "active" : ""}
                    onClick={() => setView("seo")}
                >
                    SEO ANALYSIS
                </button>
            </div>

            {view === "seo" ? (
                <SEOAnalysis seo={data.seo} />
            ) : (
                <HTMLInfo htmlInfo={data.htmlInfo} />
            )}
        </section>
    );
}

function SEOAnalysis({ seo }) {
    return (
        <>
            <div className="seo-section">
                <div className="score-card">
                    <p className="card-label">
                        SEO SCORE
                    </p>

                    <div className="score">
                        {seo.score}
                    </div>

                    <p className="rating">
                        {seo.rating}
                    </p>
                </div>

                <div className="performance-card">
                    <p className="card-label">
                        PERFORMANCE
                    </p>

                    <div className="big-value">
                        {seo.performance.responseTime}
                    </div>

                    <p className="muted">
                        Server response time
                    </p>
                </div>

                <div className="issues-card">
                    <p className="card-label">
                        SEO ISSUES
                    </p>

                    <div className="big-value">
                        {seo.issues.length}
                    </div>

                    <p className="muted">
                        Issues detected
                    </p>
                </div>
            </div>

            <div className="section-heading">
                <p className="eyebrow">
                    01 / SEO ANALYZER
                </p>

                <h3>
                    What needs attention?
                </h3>
            </div>

            <div className="issues-list">
                {seo.issues.length === 0 ? (
                    <div className="issue good">
                        No SEO issues detected.
                    </div>
                ) : (
                    seo.issues.map((issue, index) => (
                        <div
                            className={`issue ${issue.severity}`}
                            key={index}
                        >
                            <div>
                                <span className="issue-type">
                                    {issue.severity}
                                </span>

                                <h4>
                                    {issue.message}
                                </h4>
                            </div>

                            <p>
                                {issue.details}
                            </p>
                        </div>
                    ))
                )}
            </div>
        </>
    );
}

function HTMLInfo({ htmlInfo }) {
    return (
        <>
            <div className="section-heading html-heading">
                <p className="eyebrow">
                    01 / HTML INFO
                </p>

                <h3>
                    What's inside the page?
                </h3>
            </div>

            <div className="info-grid">
                <InfoCard
                    label="TITLE"
                    value={htmlInfo.title || "Missing"}
                />

                <InfoCard
                    label="META DESCRIPTION"
                    value={
                        htmlInfo.description ||
                        "Missing"
                    }
                />

                <InfoCard
                    label="CANONICAL"
                    value={
                        htmlInfo.canonical ||
                        "Not found"
                    }
                />

                <InfoCard
                    label="LINKS"
                    value={htmlInfo.links.total}
                    detail={`${htmlInfo.links.internal} internal · ${htmlInfo.links.external} external`}
                />

                <InfoCard
                    label="IMAGES"
                    value={htmlInfo.images.total}
                    detail={`${htmlInfo.images.missingAlt} missing alt`}
                />

                <InfoCard
                    label="SCRIPTS"
                    value={htmlInfo.scripts}
                />

                <InfoCard
                    label="STYLESHEETS"
                    value={htmlInfo.stylesheets}
                />

                <InfoCard
                    label="HEADINGS"
                    value={htmlInfo.headings.h1}
                    detail={`${htmlInfo.headings.h2} H2 · ${htmlInfo.headings.h3} H3`}
                />

                <InfoCard
                    label="BROKEN LINKS"
                    value={htmlInfo.links.broken}
                />

                <InfoCard
                    label="REDIRECTED LINKS"
                    value={htmlInfo.links.redirected}
                />
            </div>
        </>
    );
}

function InfoCard({ label, value, detail }) {
    return (
        <div className="info-card">
            <p className="card-label">
                {label}
            </p>

            <div className="info-value">
                {value}
            </div>

            {detail && (
                <p className="muted">
                    {detail}
                </p>
            )}
        </div>
    );
}

export default App;