---
title: "Indexer"
description: "A high-performance search engine project that integrates Python for data collection with C++ for core indexing and ranking logic."
pubDate: "Jan 15 2026"
tags: ["C++", "Python", "Flask", "BM25", "Search Engine"]
---

[GitHub Repository](https://github.com/RahulSannapureddy/Indexer)

# A Custom High-Performance Search Engine

WebScout is a full-stack search engine project that demonstrates the integration of Python's agility for data collection with C++'s performance for core indexing and ranking logic. The system provides a complete pipeline from web crawling to a functional web interface.

<br />

## Key Features

*   **Web Crawler:** A Python-based BFS (Breadth-First Search) crawler designed to scrape Wikipedia. It features connection pooling, automatic resumption, and smart filtering of namespaces and duplicate content.

*   **Clean Text Processing:** A robust preprocessing pipeline that extracts meaningful content from raw HTML, handles text normalization, and filters out common "stop words" to ensure high-quality search results.

*   **High-Performance C++ Core:** The heart of the search engine is written in C++ for maximum efficiency. It implements a custom Inverted Index data structure and uses the industry-standard BM25 (Best Matching 25) ranking algorithm for document scoring.

*   **Real-time Web Interface:** A Flask-powered web UI that interacts with the C++ engine via high-speed subprocess pipes, delivering sub-millisecond search responses to the user.

<br />

## Technical Stack

*   **Crawler & Processor:** Python, BeautifulSoup, Requests.
*   **Search Engine Core:** C++ (STL).
*   **Ranking Algorithm:** BM25.
*   **Backend Interface:** Flask (Python).
*   **Frontend:** HTML5, CSS3, JavaScript (Vanilla).

<br />

## Architecture Overview

1.  **Data Acquisition:** The crawler discovers and downloads up to 1,000 Wikipedia articles, storing them in a local repository while maintaining a URL-to-file mapping.

2.  **Indexing:** The Python processor cleans the HTML, removes boilerplate, and generates normalized token streams for the C++ engine.

3.  **Query Execution:** When a user enters a search term, the Flask server passes the query to the persistent C++ process. The engine performs tokenization, scoring, and returns the top-K relevant documents.

4.  **Presentation:** Results are dynamically rendered on the frontend, providing users with Document IDs and direct links to the original sources.

<br />

---
*Note: This project is currently evolving from a high-level architectural prototype towards a low-latency, "mechanical sympathy" focused engine, with future plans for SIMD optimizations and zero-copy memory mapping.*
