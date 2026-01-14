# Use Case Demo: Build a content recommendation system using vector search

This repository contains code for an example content recommendation system using vector search in Tinybird.

Vector search is a great way to approach content matching and recommendations. You can calculate embeddings based on multi-modal analysis of text, images, and other media, then calculate vector distances between embeddings to recommend matching content.

## Key Features

- **HuggingFace Embeddings**: Uses HuggingFace all-MiniLM-L6-v2 (384 dimensions) - free and runs locally
- **Standalone Scripts**: Python and Node.js scripts that work independently
- **Slug-based Queries**: Queries are based on the post slug to ensure consistent results
- **Production-Ready**: Multi-node Tinybird pipes for optimal performance

## How It Works

1. **Generate Embeddings**: Scripts use HuggingFace models to generate embeddings locally
2. **Store in Tinybird**: Embeddings are sent to Tinybird via Events API along with post metadata
3. **Query Similar Posts**: The Tinybird pipe finds posts with similar embeddings using cosine similarity
4. **Return Results**: Related posts are returned sorted by similarity score

## Architecture

```plaintext
┌─────────────┐
│   Posts     │
│  (Script)   │
└──────┬──────┘
       │
       ├──► Generate Embeddings
       │    (HuggingFace all-MiniLM-L6-v2)
       │
       ▼
┌─────────────────┐
│   Tinybird      │
│  Data Source    │
│  (posts)        │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Tinybird Pipe  │
│ (similar_posts) │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Tinybird API   │
│  Endpoint       │
└─────────────────┘
```

## Setup

### 1. Install and Authenticate Tinybird CLI

First, install the Tinybird CLI (if not already installed):

```bash
cd tinybird
curl https://tinybird.co | sh
```

Then authenticate with your Tinybird account:

```bash
tb login
```

This will open your browser where you can create a new workspace or select an existing one.

### 2. Build and Deploy Tinybird Resources

```bash
# Build the project (builds all datasources and pipes)
tb build

# Deploy to Tinybird Cloud
tb --cloud deploy
```

See the [Tinybird Quick Start guide](https://www.tinybird.co/docs/forward/get-started/quick-start) for more details.

### 3. Install Dependencies

**For Python:**

```bash
cd scripts/python
pip install -r requirements.txt
```

**For Node.js:**

```bash
cd scripts/node
npm install
```

### 4. Set Environment Variables

You'll need tokens with the appropriate scopes:

- `DATASOURCES:WRITE` scope to send events to Tinybird
- `PIPES:READ` scope to query the pipe endpoint

See the [Tinybird Tokens documentation](https://www.tinybird.co/docs/forward/administration/tokens) for instructions on creating tokens.

```bash
export TB_HOST=https://api.tinybird.co  # or your Tinybird host
export TB_TOKEN=your_tinybird_token_here
```

### 5. Generate Embeddings

The scripts automatically load posts from `sample-data/posts.json` by default. You can customize the source using the `POSTS_SOURCE` environment variable to point to a different file or URL.

**Posts JSON file format:**

The scripts expect a JSON file with a direct array of posts:

```json
[
  {
    "slug": "my-post",
    "title": "My Post Title",
    "excerpt": "Post excerpt...",
    "content": "Full content...",
    "categories": ["tech"],
    "published_on": "2025-01-15",
    "status": "published",
    "updated_at": "2025-01-20"
  }
]
```

#### Using Python

##### Run with default sample data

```bash
cd scripts/python
python generate_embeddings.py
```

##### Run with custom posts file or URL

```bash
# From a local file
POSTS_SOURCE=../custom/posts.json python generate_embeddings.py

# From a URL (e.g., your CMS API)
POSTS_SOURCE=https://your-cms.com/api/posts python generate_embeddings.py
```

##### Use as a library

```python
import sys
sys.path.append('scripts/python')
from generate_embeddings import send_posts_to_tinybird, get_related_posts, load_posts_from_source
from sentence_transformers import SentenceTransformer

# Load model
model = SentenceTransformer('all-MiniLM-L6-v2')

# Load posts from file or URL
posts = load_posts_from_source('sample-data/posts.json')
# Or from URL:
# posts = load_posts_from_source('https://your-cms.com/api/posts')

# Generate embeddings and send to Tinybird
send_posts_to_tinybird(posts, model)

# Get related posts
related = get_related_posts("my-post", limit=10)
```

#### Using Node.js

##### Run with default sample data

```bash
cd scripts/node
node generate_embeddings.js
```

##### Run with custom posts file or URL

```bash
# From a local file
POSTS_SOURCE=../custom/posts.json node generate_embeddings.js

# From a URL (e.g., your CMS API)
POSTS_SOURCE=https://your-cms.com/api/posts node generate_embeddings.js
```

##### Use as a library

```javascript
const { sendPostsToTinybird, getRelatedPosts, loadPostsFromSource } = require('./scripts/node/generate_embeddings');
const { pipeline } = require('@xenova/transformers');

// Load model
const model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

// Load posts from file or URL
const posts = await loadPostsFromSource('sample-data/posts.json');
// Or from URL:
// const posts = await loadPostsFromSource('https://your-cms.com/api/posts');

// Generate embeddings and send to Tinybird
await sendPostsToTinybird(posts, model);

// Get related posts
const related = await getRelatedPosts("my-post", 10);
```

### 6. Query Related Posts

Once embeddings are in Tinybird, you can query the pipe endpoint:

```bash
curl --compressed \
  -H "Authorization: Bearer $TB_TOKEN" \
  "https://<your_host>/v0/pipes/similar_posts.json?slug=my-post&limit=10"
```

### 7. Automated Workflows (GitHub Actions)

This repository includes a GitHub Actions workflow (`.github/workflows/tinybird_recommendations.yml`) as an **example** for automating the embedding generation process.

**Important**: The workflow is provided as a template. To use it with your actual blog content, you need to:

1. **Configure the posts source**: The scripts load from `sample-data/posts.json` by default. To use your own data source, set the `POSTS_SOURCE` environment variable in the workflow:

   - For a local file: `POSTS_SOURCE: sample-data/posts.json`
   - For a URL/API: `POSTS_SOURCE: https://your-cms.com/api/posts`

   You can also create a script that fetches posts from your CMS and saves them to a JSON file before running the embedding script.

2. **Configure GitHub Secrets**:
   - `TB_TOKEN`: Your Tinybird token with `DATASOURCES:WRITE` and `PIPES:READ` scopes
   - `TB_HOST` (optional): Your Tinybird host (defaults to `https://api.tinybird.co`)
   - `POSTS_SOURCE` (optional): Custom posts file path or URL (defaults to `sample-data/posts.json`)

3. **Customize the schedule**: The workflow runs twice daily (midnight and noon UTC) by default. Adjust the cron expression in the workflow file to match your needs.

The workflow will automatically:

- Install Python dependencies
- Run the embedding generation script (loading posts from the configured source)
- Send embeddings to your Tinybird data source

**Example workflow modification**: To fetch posts from a CMS before generating embeddings, add a step:

```yaml
- name: Fetch posts from CMS
  run: |
    curl -o posts.json https://your-cms.com/api/posts
- name: Generate recommendations
  env:
    TB_TOKEN: ${{ secrets.TB_TOKEN }}
    TB_HOST: ${{ secrets.TB_HOST }}
    POSTS_SOURCE: posts.json
  run: python scripts/python/generate_embeddings.py
```

## Embedding Models

This example uses **HuggingFace all-MiniLM-L6-v2** (384 dimensions), which:

- Runs locally (no API keys required)
- Is free to use
- Provides good quality embeddings
- Has 384 dimensions (smaller than OpenAI, but sufficient for most use cases)

### Alternative Models

You can use any embedding model—whether from HuggingFace or another source—by updating the script implementation to load and apply your preferred model. Just make sure to adjust the processing code and pipeline to accommodate the output from your chosen embedding model.

**Important**: If you change models, update the pipe's dimension check (currently `length(embedding) = 384`) and regenerate all embeddings.

### Example: Using OpenAI Embeddings (Node.js)

You can also use OpenAI's API for higher-dimensional embeddings (e.g., `text-embedding-3-small`, 1536 dims). Note that this requires an `OPENAI_API_KEY` and may incur API costs.

Here's a basic example (JavaScript / Node.js, using `openai` npm package):

```js
import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getOpenAIEmbedding(text) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  // Returns array of floats (length 1536)
  return response.data[0].embedding;
}

// Example usage:
const post = {
  slug: "my-post",
  title: "My Post Title",
  excerpt: "Post excerpt...",
  content: "Full content...",
  categories: ["tech"],
  published_on: "2025-01-15",
  status: "published",
};

const textToEmbed = `${post.title} ${post.excerpt} ${post.content}`;
const embedding = await getOpenAIEmbedding(textToEmbed);
// Now use `embedding` in the event you send to Tinybird
```

_If using OpenAI, ensure your Tinybird pipes and queries expect 1536 dimensions: update any checks from `length(embedding) = 384` to `length(embedding) = 1536`, and regenerate all embeddings accordingly._

## API Reference

### Tinybird Pipe: `similar_posts`

Get related posts for a given slug.

**Query Parameters:**

- `slug` (required): Post slug to find related posts for
- `limit` (optional): Maximum number of results (default: 10)
- `min_similarity` (optional): Minimum similarity threshold (default: 0.1)

**Response:**

```json
{
  "data": [
    {
      "slug": "related-post",
      "title": "Related Post Title",
      "excerpt": "Related post excerpt",
      "categories": ["tech", "ai"],
      "published_on": "2025-01-15",
      "status": "published",
      "similarity": 0.85
    }
  ]
}
```

## Real-World Example

See the [Tinybird Blog](https://www.tinybird.co/blog) for a production implementation of this system. Each blog post uses vector search to show related content at the bottom of the page.

## Need help?

- Read the [Tinybird Vector Search Guide](https://www.tinybird.co/docs/classic/get-started/use-cases/vector-search-recommendation)
- Join the [Tinybird Slack Community](https://www.tinybird.co/slack) for support
- Explore [Tinybird Documentation](https://www.tinybird.co/docs) for more use cases

## Authors

- [Jordi Villar](https://github.com/jrdi)
- [Cameron Archer](https://github.com/tb-peregrine)
