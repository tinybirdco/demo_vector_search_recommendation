/**
 * Generate embeddings for blog posts and send them to Tinybird.
 *
 * This script demonstrates how to:
 * 1. Calculate vector embeddings using HuggingFace models
 * 2. Post embeddings to a Tinybird Data Source using the Events API
 * 3. Query the Tinybird pipe to find similar posts
 */

const { pipeline } = require("@xenova/transformers");
const fs = require("fs").promises;
const path = require("path");

// Configuration
const TB_HOST = process.env.TB_HOST || "https://api.tinybird.co";
const TB_TOKEN = process.env.TB_TOKEN;
const DATASOURCE_NAME = "posts";
const PIPE_NAME = "similar_posts";

// HuggingFace model
const MODEL_NAME = "Xenova/all-MiniLM-L6-v2"; // 384 dimensions

/**
 * Generate an embedding for the given text using HuggingFace model.
 *
 * @param {string} text - Text to generate embedding for
 * @param {Object} model - Loaded HuggingFace model pipeline
 * @returns {Promise<Array<number>>} Array of floats representing the embedding vector
 */
async function generateEmbedding(text, model) {
  const output = await model(text, {
    pooling: "mean",
    normalize: true,
  });

  // Convert tensor to array
  return Array.from(output.data);
}

/**
 * Generate embeddings for posts and send them to Tinybird.
 *
 * @param {Array} posts - List of post objects with slug, title, excerpt, etc.
 * @param {Object} model - Loaded HuggingFace model pipeline
 */
async function sendPostsToTinybird(posts, model) {
  if (!TB_TOKEN) {
    throw new Error("TB_TOKEN environment variable is required");
  }

  const timestamp = new Date().toISOString();
  const events = [];

  for (const post of posts) {
    // Prepare text for embedding (title + excerpt + content)
    const textParts = [post.title || "", post.excerpt || ""];
    if (post.content) {
      textParts.push(post.content.substring(0, 3000)); // Limit content length
    }

    const textToEmbed = textParts.join(" ").trim();

    if (!textToEmbed) {
      console.warn(
        `⚠️  Skipping ${post.slug || "unknown"}: no content to embed`
      );
      continue;
    }

    // Generate embedding
    const embedding = await generateEmbedding(textToEmbed, model);

    // Prepare event for Tinybird
    const event = {
      timestamp,
      slug: post.slug,
      title: post.title || "",
      excerpt: post.excerpt || "",
      embedding,
      categories: post.categories || [],
      published_on: post.published_on || "",
      status: post.status || "published",
      updated_at: post.updated_at || timestamp,
    };

    events.push(JSON.stringify(event));
  }

  if (events.length === 0) {
    console.log("No events to send");
    return;
  }

  // Send to Tinybird Events API
  const url = `${TB_HOST}/v0/events`;
  const params = new URLSearchParams({
    name: DATASOURCE_NAME,
    token: TB_TOKEN,
  });

  // Format as NDJSON (newline-delimited JSON)
  const data = events.join("\n");

  const response = await fetch(`${url}?${params}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-ndjson",
    },
    body: data,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Tinybird API error: ${response.status} - ${error}`);
  }

  console.log(`✅ Successfully sent ${events.length} posts to Tinybird`);
}

/**
 * Get related posts for a given slug using Tinybird pipe.
 *
 * @param {string} slug - Post slug to find related posts for
 * @param {number} limit - Maximum number of related posts to return
 * @returns {Promise<Array>} List of related post objects
 */
async function getRelatedPosts(slug, limit = 10) {
  if (!TB_TOKEN) {
    throw new Error("TB_TOKEN environment variable is required");
  }

  const url = `${TB_HOST}/v0/pipes/${PIPE_NAME}.json`;
  const params = new URLSearchParams({
    slug,
    limit: limit.toString(),
    token: TB_TOKEN,
  });

  const response = await fetch(`${url}?${params}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Tinybird API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Load posts from a file path or URL (mimics fetching from an endpoint).
 *
 * @param {string} source - File path (relative to repo root) or URL
 * @returns {Promise<Array>} List of post objects
 */
async function loadPostsFromSource(source) {
  let data;
  // Check if it's a URL (starts with http:// or https://)
  if (source.startsWith("http://") || source.startsWith("https://")) {
    console.log(`📡 Fetching posts from URL: ${source}`);
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch posts: ${response.status} ${response.statusText}`
      );
    }
    data = await response.json();
  } else {
    // It's a file path - resolve relative to repo root
    const repoRoot = path.resolve(__dirname, "../..");
    const filePath = path.join(repoRoot, source);
    console.log(`📂 Loading posts from file: ${filePath}`);
    const fileContent = await fs.readFile(filePath, "utf-8");
    data = JSON.parse(fileContent);
  }

  // Expect direct array of posts
  if (!Array.isArray(data)) {
    throw new Error(
      `Invalid posts format. Expected array of posts, got ${typeof data}`
    );
  }

  return data;
}

// Example usage
async function main() {
  // Load posts from sample data file (can be replaced with a URL or custom file path)
  // This mimics fetching posts from an API endpoint
  const postsSource = process.env.POSTS_SOURCE || "sample-data/posts.json";

  let posts;
  try {
    posts = await loadPostsFromSource(postsSource);
    console.log(`✅ Loaded ${posts.length} posts from ${postsSource}`);
  } catch (error) {
    console.error(`❌ Error loading posts from ${postsSource}:`, error.message);
    console.log(
      "💡 Tip: Set POSTS_SOURCE environment variable to use a different file or URL"
    );
    process.exit(1);
  }

  try {
    console.log(`\nLoading HuggingFace model: ${MODEL_NAME}...`);
    const model = await pipeline("feature-extraction", MODEL_NAME);
    console.log(`✅ Model loaded (dimensions: 384)`);

    console.log("\nGenerating embeddings and sending to Tinybird...");
    await sendPostsToTinybird(posts, model);

    if (posts.length > 0) {
      console.log("\nFinding related posts...");
      const firstSlug = posts[0].slug || "vector-search-introduction";
      const related = await getRelatedPosts(firstSlug, 5);
      console.log(`Found ${related.length} related posts:`);
      for (const post of related) {
        console.log(
          `  - ${post.title} (similarity: ${post.similarity?.toFixed(3) || 0})`
        );
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { sendPostsToTinybird, getRelatedPosts, loadPostsFromSource };
