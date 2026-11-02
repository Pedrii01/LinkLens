require("dotenv").config();

const mongoose = require("mongoose");
const Analysis = require("./models/Analysis");

const express = require("express");
const cors = require("cors");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());



app.get("/", (req, res) => {
    res.json({
        message: "la la linkLens "
    });
});


app.post("/api/analyze", async (req, res) => {
    const url = req.body.url;

    try {

        await connectDB();
        const startTime = Date.now();

        const response = await fetch(url);
        const responseTime = Date.now() - startTime;

        const html = await response.text(); 
        const $ = cheerio.load(html);

        const title = $("title").text().trim();

        const description =
            $('meta[name="description"]').attr("content") || null;

        const canonical =
            $('link[rel="canonical"]').attr("href") || null;

        const images = $("img").length;

        const missingAlt =
            $("img:not([alt])").length;

        const scripts = $("script").length;

        const stylesheets =
            $('link[rel="stylesheet"]').length;

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

            } catch (error) {
            }
        });
        const internalLinksArray = [...internalLinks];
        const externalLinksArray = [...externalLinks];

        const allLinks = [
            ...internalLinksArray,
            ...externalLinksArray
        ];



        const results = await Promise.all(
            allLinks.map(async (link) => {
                try {
                    let linkResponse = await fetch(link, {
                        method: "HEAD"
                    });

                    if (linkResponse.status === 405) {
                        linkResponse = await fetch(link);
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
            })
        );

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
                details:
                    "Add a title to help search engines understand the page."
            });
        }

        if (title.length >= 30 && title.length <= 60) {
            seoScore += 10;
        } else if (title) {
            seoIssues.push({
                severity: "warning",
                type: "title-length",
                message: "Title length could be improved",
                details:
                    `Your title is ${title.length} characters. ` +
                    "Aim for roughly 30–60 characters."
            });
        }


        if (description) {
            seoScore += 15;
        } else {
            seoIssues.push({
                severity: "error",
                type: "missing-description",
                message: "Meta description is missing",
                details:
                    "Add a meta description that summarizes the page."
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
                details:
                    `Your description is ${description.length} characters. ` +
                    "Aim for roughly 120–160 characters."
            });
        }


        if (h1 === 1) {
            seoScore += 15;
        } else if (h1 === 0) {
            seoIssues.push({
                severity: "error",
                type: "missing-h1",
                message: "No H1 heading found",
                details:
                    "Add a main H1 heading describing the page."
            });
        } else {
            seoIssues.push({
                severity: "warning",
                type: "multiple-h1",
                message: "Multiple H1 headings found",
                details:
                    `This page contains ${h1} H1 headings.`
            });
        }

        if (images === 0 || missingAlt === 0) {
            seoScore += 10;
        } else {
            seoIssues.push({
                severity: "warning",
                type: "missing-alt",
                message:
                    `${missingAlt} image(s) are missing alt text`,
                details:
                    "Add descriptive alt text to images where appropriate."
            });
        }


        if (canonical) {
            seoScore += 10;
        } else {
            seoIssues.push({
                severity: "warning",
                type: "missing-canonical",
                message: "Canonical URL is missing",
                details:
                    "Consider adding a canonical URL to identify the preferred version of this page."
            });
        }

        const isHttps = url.startsWith("https://");

        if (isHttps) {
            seoScore += 15;
        } else {
            seoIssues.push({
                severity: "error",
                type: "not-https",
                message: "Website is not using HTTPS",
                details:
                    "Use HTTPS to secure connections to the website."
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

res.status(201).json({
    ...analysisData,
    _id: savedAnalysis._id,
    createdAt: savedAnalysis.createdAt
});


    } catch (error) {
    console.error("ANALYSIS ERROR:", error);

    res.status(500).json({
        error: "Failed to analyze website",
        message: error.message
    });
}
});



let dbConnectionPromise;


async function connectDB() {
    if (mongoose.connection.readyState === 1) {
        return;
    }

    console.log(
        "MongoDB variable found:",
        Boolean(process.env.MONGODB_URL)
    );

    if (!process.env.MONGODB_URL) {
        throw new Error("MONGODB_URL is missing");
    }

    if (!dbConnectionPromise) {
        dbConnectionPromise = mongoose.connect(
            process.env.MONGODB_URL
        ).catch((error) => {
            dbConnectionPromise = null;
            throw error;
        });
    }

    await dbConnectionPromise;
}
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        res.status(503).json({
            error: "Database temporarily unavailable"
        });
    }
});

module.exports = app;
