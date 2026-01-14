#!/usr/bin/env python3
"""
Generate embeddings for blog posts and send them to Tinybird.

This script demonstrates how to:
1. Calculate vector embeddings using HuggingFace models
2. Post embeddings to a Tinybird Data Source using the Events API
3. Query the Tinybird pipe to find similar posts
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List

import requests

# HuggingFace imports
try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    print("Error: sentence-transformers not installed.")
    print("Install it with: pip install -r requirements.txt")
    exit(1)

# Configuration
TB_HOST = os.getenv("TB_HOST", "https://api.tinybird.co")
TB_TOKEN = os.getenv("TB_TOKEN")
DATASOURCE_NAME = "posts"
PIPE_NAME = "similar_posts"

# HuggingFace model
MODEL_NAME = "all-MiniLM-L6-v2"  # 384 dimensions


def generate_embedding(text: str, model: SentenceTransformer) -> List[float]:
    """
    Generate an embedding for the given text using HuggingFace model.

    Args:
        text: Text to generate embedding for
        model: Loaded SentenceTransformer model

    Returns:
        List of floats representing the embedding vector
    """
    embedding = model.encode(text, normalize_embeddings=True)
    return embedding.tolist()


def send_posts_to_tinybird(posts: List[Dict], model: SentenceTransformer) -> None:
    """
    Generate embeddings for posts and send them to Tinybird.

    Args:
        posts: List of post dictionaries with slug, title, excerpt, etc.
        model: Loaded SentenceTransformer model
    """
    if not TB_TOKEN:
        raise ValueError("TB_TOKEN environment variable is required")

    timestamp = datetime.now().isoformat()
    events = []

    for post in posts:
        # Prepare text for embedding (title + excerpt + content)
        text_parts = [post.get("title", ""), post.get("excerpt", "")]
        if post.get("content"):
            text_parts.append(post["content"][:3000])  # Limit content length

        text_to_embed = " ".join(text_parts).strip()

        if not text_to_embed:
            print(f"⚠️  Skipping {post.get('slug', 'unknown')}: no content to embed")
            continue

        # Generate embedding
        embedding = generate_embedding(text_to_embed, model)

        # Prepare event for Tinybird
        event = {
            "timestamp": timestamp,
            "slug": post.get("slug"),
            "title": post.get("title", ""),
            "excerpt": post.get("excerpt", ""),
            "embedding": embedding,
            "categories": post.get("categories", []),
            "published_on": post.get("published_on", ""),
            "status": post.get("status", "published"),
            "updated_at": post.get("updated_at", timestamp),
        }

        events.append(json.dumps(event))

    if not events:
        print("No events to send")
        return

    # Send to Tinybird Events API
    url = f"{TB_HOST}/v0/events"
    params = {
        "name": DATASOURCE_NAME,
        "token": TB_TOKEN,
    }

    # Format as NDJSON (newline-delimited JSON)
    data = "\n".join(events)

    response = requests.post(
        url, params=params, data=data, headers={"Content-Type": "application/x-ndjson"}
    )

    response.raise_for_status()
    print(f"✅ Successfully sent {len(events)} posts to Tinybird")


def get_related_posts(slug: str, limit: int = 10) -> List[Dict]:
    """
    Get related posts for a given slug using Tinybird pipe.

    Args:
        slug: Post slug to find related posts for
        limit: Maximum number of related posts to return

    Returns:
        List of related post dictionaries
    """
    if not TB_TOKEN:
        raise ValueError("TB_TOKEN environment variable is required")

    url = f"{TB_HOST}/v0/pipes/{PIPE_NAME}.json"
    params = {
        "slug": slug,
        "limit": limit,
        "token": TB_TOKEN,
    }

    response = requests.get(url, params=params)
    response.raise_for_status()

    return response.json().get("data", [])


def load_posts_from_source(source: str) -> List[Dict]:
    """
    Load posts from a file path or URL (mimics fetching from an endpoint).

    Args:
        source: File path (relative to repo root) or URL

    Returns:
        List of post dictionaries
    """
    # Check if it's a URL (starts with http:// or https://)
    if source.startswith(("http://", "https://")):
        print(f"📡 Fetching posts from URL: {source}")
        response = requests.get(source)
        response.raise_for_status()
        data = response.json()
    else:
        # It's a file path - resolve relative to repo root
        script_dir = Path(__file__).parent.parent.parent
        file_path = script_dir / source
        print(f"📂 Loading posts from file: {file_path}")
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

    # Expect direct array of posts
    if not isinstance(data, list):
        raise ValueError(
            f"Invalid posts format. Expected array of posts, got {type(data)}"
        )

    return data


# Example usage
if __name__ == "__main__":
    # Load posts from sample data file (can be replaced with a URL or custom file path)
    # This mimics fetching posts from an API endpoint
    posts_source = os.getenv("POSTS_SOURCE", "sample-data/posts.json")

    try:
        posts = load_posts_from_source(posts_source)
        print(f"✅ Loaded {len(posts)} posts from {posts_source}")
    except Exception as e:
        print(f"❌ Error loading posts from {posts_source}: {e}")
        print(
            "💡 Tip: Set POSTS_SOURCE environment variable to use a different file or URL"
        )
        exit(1)

    print(f"\nLoading HuggingFace model: {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)
    print(f"✅ Model loaded (dimensions: {model.get_sentence_embedding_dimension()})")

    print("\nGenerating embeddings and sending to Tinybird...")
    send_posts_to_tinybird(posts, model)

    if posts:
        print("\nFinding related posts...")
        first_slug = posts[0].get("slug", "vector-search-introduction")
        related = get_related_posts(first_slug, limit=5)
        print(f"Found {len(related)} related posts:")
        for post in related:
            print(
                f"  - {post.get('title')} (similarity: {post.get('similarity', 0):.3f})"
            )
