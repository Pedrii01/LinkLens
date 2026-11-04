
console.log("SERVER.JS FILE EXECUTING");

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const cheerio = require("cheerio");
const Analysis = require("./models/Analysis");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

let dbConnectionPromise;

async function connectDB() {
    if (mongoose.connection.readyState === 1) return;

    if (!process.env.MONGODB_URL) {
        throw new Error("MONGODB_URL is missing");
    }

    if (!dbConnectionPromise) {
        dbConnectionPromise = mongoose
            .connect(process.env.MONGODB_URL)
            .catch((error) => {
                dbConnectionPromise = null;
                throw error;
            });
    }

    await dbConnectionPromise;
}

// Ensure API routes have a database connection
app.use("/api", async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (error) {
        console.error("DATABASE CONNECTION ERROR:", error.message);

        return res.status(503).json({
            error: "Database unavailable",
            message: "Could not connect to the database."
        });
    }
});

app.get("/", (req, res) => {
    res.status(200).json({
        message: "LinkLens API is running"
    });
});

// Analyze website
app.post("/api/analyze", async (req, res) => {
    try {
        let { url } = req.body || {};

        if (!url || typeof url !== "string") {
            return res.status(400).json({
                error: "URL is required"
            });
        }

        url = url.trim();

        if (!/^https?:\/\//i.test(url)) {
            url = `https://${url}`;
        }

        let parsedUrl;

        try {
            parsedUrl = new URL(url);
        } catch {
            return res.status(400).json({
                error: "Invalid URL"
            });
        }

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
            return res.status(400).json({
                error: "Only HTTP and HTTPS URLs are supported"
            });
        }

        const startTime = Date.now();

        const response = await fetch(url, {
            signal: AbortSignal.timeout(15000),
            headers: {
                "User-Agent": "LinkLens/1.0"
            }
        });

        const responseTime = Date.now() - startTime;

        if (!response.ok && ![403, 401].includes(response.status)) {
            return res.status(502).json({
                error: "Website request failed",
                message: `The website returned HTTP ${response.status}`
            });
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const title = $("title").text().trim();

        const description =
            $('meta[name="description"]').attr("content") || null;

        const canonical =
            $('link[rel="canonical"]').attr("href") || null;

        const images = $("img").length;
        const missingAlt = $("img:not([alt])").length;

        const scripts = $("script").length;
        const stylesheets = $('link[rel="stylesheet"]').length;

        const h1 = $("h1").length;
        const h2 = $("h2").length;
        const h3 = $("h3").length;

        const internalLinks = new Set();
        const externalLinks = new Set();

        const baseUrl = new URL(url);

        $("a").each((index, element) => {
            const href = $(element).attr("href");

            if (!href) return;

            try {
                const link = new URL(href, url);

                if (
                    link.protocol !== "http:" &&
                    link.protocol !== "https:"
                ) {
                    return;
                }

                if (link.hostname === baseUrl.hostname) {
                    internalLinks.add(link.href);
                } else {
                    externalLinks.add(link.href);
                }
            } catch {
                // Ignore malformed links
            }
        });

        const internalLinksArray = [...internalLinks];
        const externalLinksArray = [...externalLinks];

        const allLinks = [
            ...internalLinksArray,
            ...externalLinksArray
        ];

        // Limit link checks to prevent excessive simultaneous requests
        const linksToCheck = allLinks.slice(0, 50);

        async function checkLink(link) {
            try {
                let linkResponse = await fetch(link, {
                    method: "HEAD",
                    signal: AbortSignal.timeout(8000),
                    redirect: "follow",
                    headers: {
                        "User-Agent": "LinkLens/1.0"
                    }
                });

                if (
                    linkResponse.status === 405 ||
                    linkResponse.status === 501
                ) {
                    linkResponse = await fetch(link, {
                        signal: AbortSignal.timeout(8000),
                        redirect: "follow",
                        headers: {
                            "User-Agent": "LinkLens/1.0"
                        }
                    });
                }

                return {
                    url: link,
                    statusCode: linkResponse.status,
                    finalUrl: linkResponse.url
                };
            } catch (error) {
                return {
                    url: link,
                    error: error.message
                };
            }
        }

        // Process links in batches of 10
        const results = [];

        for (let i = 0; i < linksToCheck.length; i += 10) {
            const batch = linksToCheck.slice(i, i + 10);
            const batchResults = await Promise.all(
                batch.map(checkLink)
            );

            results.push(...batchResults);
        }

        const brokenLinks = results.filter(
            (link) =>
                link.statusCode === 404 ||
                link.statusCode === 410
        );

        const redirectedLinks = results.filter(
            (link) =>
                link.finalUrl &&
                link.finalUrl !== link.url
        );

        let seoScore = 0;
        const seoIssues = [];

        if (title) {
            seoScore += 15;
        } else {
            seoIssues.push({
                severity: "error",
                type: "missing-title",
                message: "Title is missing",
                details: "Add a title to help search engines understand the page."
            });
        }

        if (title.length >= 30 && title.length <= 60) {
            seoScore += 10;
        } else if (title) {
            seoIssues.push({
                severity: "warning",
                type: "title-length",
                message: "Title length could be improved",
                details: `Your title is ${title.length} characters. Aim for roughly 30–60 characters.`
            });
        }

        if (description) {
            seoScore += 15;
        } else {
            seoIssues.push({
                severity: "error",
                type: "missing-description",
                message: "Meta description is missing",
                details: "Add a meta description that summarizes the page."
            });
        }

        if (
            description &&
            description.length >= 120 &&
            description.length <= 160
        ) {
            seoScore += 10;
        } else if (description) {
            seoIssues.push({
                severity: "warning",
                type: "description-length",
                message: "Meta description length could be improved",
                details: `Your description is ${description.length} characters. Aim for roughly 120–160 characters.`
            });
        }

        if (h1 === 1) {
            seoScore += 15;
        } else if (h1 === 0) {
            seoIssues.push({
                severity: "error",
                type: "missing-h1",
                message: "No H1 heading found",
                details: "Add a main H1 heading describing the page."
            });
        } else {
            seoIssues.push({
                severity: "warning",
                type: "multiple-h1",
                message: "Multiple H1 headings found",
                details: `This page contains ${h1} H1 headings.`
            });
        }

        if (images === 0 || missingAlt === 0) {
            seoScore += 10;
        } else {
            seoIssues.push({
                severity: "warning",
                type: "missing-alt",
                message: `${missingAlt} image(s) are missing alt text`,
                details: "Add descriptive alt text to images where appropriate."
            });
        }

        if (canonical) {
            seoScore += 10;
        } else {
            seoIssues.push({
                severity: "warning",
                type: "missing-canonical",
                message: "Canonical URL is missing",
                details: "Consider adding a canonical URL to identify the preferred version of this page."
            });
        }

        if (parsedUrl.protocol === "https:") {
            seoScore += 15;
        } else {
            seoIssues.push({
                severity: "error",
                type: "not-https",
                message: "Website is not using HTTPS",
                details: "Use HTTPS to secure connections to the website."
            });
        }

        let seoRating;

        if (seoScore >= 90) {
            seoRating = "Excellent";
        } else if (seoScore >= 75) {
            seoRating = "Good";
        } else if (seoScore >= 50) {
            seoRating = "Needs Improvement";
        } else {
            seoRating = "Poor";
        }

        const analysisData = {
            url,

            htmlInfo: {
                title,
                description,
                canonical,

                links: {
                    total: allLinks.length,
                    internal: internalLinksArray.length,
                    external: externalLinksArray.length,
                    broken: brokenLinks.length,
                    redirected: redirectedLinks.length
                },

                images: {
                    total: images,
                    missingAlt
                },

                scripts,
                stylesheets,

                headings: {
                    h1,
                    h2,
                    h3
                }
            },

            seo: {
                performance: {
                    responseTime: `${responseTime} ms`
                },

                score: seoScore,
                rating: seoRating,
                issues: seoIssues
            },

            linkChecks: results
        };

        const savedAnalysis = await Analysis.create(analysisData);

        return res.status(201).json({
            ...analysisData,
            _id: savedAnalysis._id,
            createdAt: savedAnalysis.createdAt
        });

    } catch (error) {
        console.error("ANALYSIS ERROR:", error);

        if (!res.headersSent) {
            return res.status(500).json({
                error: "Failed to analyze website",
                message: error.message
            });
        }
    }
});

// Get latest 10 analyses
app.get("/api/history", async (req, res) => {
    try {
        const history = await Analysis.find({})
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        return res.status(200).json(history);
    } catch (error) {
        console.error("HISTORY ERROR:", error);

        return res.status(500).json({
            error: "Failed to fetch history",
            message: error.message
        });
    }
});

// Get one analysis
app.get("/api/history/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                error: "Invalid analysis ID"
            });
        }

        const analysis = await Analysis.findById(id);

        if (!analysis) {
            return res.status(404).json({
                error: "Analysis not found"
            });
        }

        return res.status(200).json(analysis);
    } catch (error) {
        console.error("HISTORY ERROR:", error);

        return res.status(500).json({
            error: "Failed to fetch analysis",
            message: error.message
        });
    }
});

// Delete one analysis
app.delete("/api/history/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                error: "Invalid analysis ID"
            });
        }

        const analysis = await Analysis.findByIdAndDelete(id);

        if (!analysis) {
            return res.status(404).json({
                error: "Analysis not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Analysis deleted successfully"
        });
    } catch (error) {
        console.error("HISTORY DELETE ERROR:", error);

        return res.status(500).json({
            error: "Failed to delete analysis",
            message: error.message
        });
    }
});

// Start server locally; export app for Vercel
if (require.main === module) {
    connectDB()
        .then(() => {
            app.listen(PORT, () => {
                console.log(`Server running on port ${PORT}`);
            });
        })
        .catch((error) => {
            console.error("MongoDB connection failed:", error.message);
            process.exit(1);
        });
}

module.exports = app;
