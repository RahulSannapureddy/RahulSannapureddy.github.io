---
title: "WebScout"
description: "A high-performance search engine project that integrates Python for data collection with C++ for core indexing and ranking logic."
pubDate: "Jan 15 2026"
tags: ["C++", "Python", "Flask", "BM25", "Search Engine"]
---

[GitHub Repository](https://github.com/RahulSannapureddy/WebScout)

# Building a Search Engine From Scratch: How WebScout Works Under the Hood

I built a search engine. Not a wrapper around Google, not a call to some API. An actual search engine that crawls web pages, processes them into searchable text, indexes them, and ranks results. It is called WebScout, and it searches a local corpus of about 1,100 Simple Wikipedia articles.

This post walks through every part of the system: how the data gets collected, how it gets cleaned up, how the index works internally, and how the ranking algorithm scores documents. If you have taken a data structures course and maybe an intro to systems, you should be able to follow along.

## The Big Picture

WebScout is a pipeline. There are four stages, and each one runs independently. They communicate through the file system (just files and folders in a `data/` directory), which means you can run the crawler once, then re-run the parser if you change something, and the search engine will pick up whatever is sitting in the processed files when it starts.

Here is the flow:

1. **Crawl** (Python): A script visits Simple Wikipedia pages and saves their raw HTML to disk.
2. **Parse** (Python): Another script reads those HTML files, strips out everything except the article body, normalizes the text, and writes two versions of each document to disk.
3. **Index** (C++): When the search engine starts, it reads all the processed text files and builds an in-memory inverted index.
4. **Search** (C++ + Flask): A Flask web server launches the C++ engine as a subprocess. The user types a query in the browser, Flask pipes it to C++, C++ ranks documents using BM25, and the results come back through stdout.

This kind of design is sometimes called a "decoupled pipeline." The big advantage is that each stage is totally independent. The crawler does not know anything about the indexer. The parser does not know anything about Flask. If I wanted to swap out BM25 for a different algorithm, the only file I would need to change is the ranking module. Nothing else would even notice.

## Stage 1: The Crawler

The crawler lives in `src/crawler/crawler.py`. Its job is simple: start from a seed URL and explore Wikipedia link by link, saving each page's HTML to disk.

### How It Explores

It uses Breadth-First Search (BFS). If you have seen BFS in a graph theory or algorithms class, this is the same idea applied to the web. You start with one URL (the seed). You visit it. You extract all the links on that page. You add those links to a queue. Then you take the next URL from the front of the queue, visit it, extract links, and repeat.

The seed URL is the Simple Wikipedia page for Formula One. From there, the crawler naturally discovers related articles (racing, cars, countries, specific Grand Prix events, etc.) because those pages link to each other.

### Handling Duplicates and Filenames

Wikipedia URLs can have fragments (the `#section-name` part). Two URLs that differ only by fragment point to the same page, so the crawler strips fragments before adding anything to its queue. It also tracks URLs it has already seen in a `set`, so it never visits the same page twice.

For filenames, the crawler takes the URL and runs it through SHA-256 hashing. So `https://simple.wikipedia.org/wiki/Formula_One` becomes something like `a3f8c...e21.html`. This avoids dealing with special characters in filenames and guarantees uniqueness. The mapping between hash-filenames and their original URLs is saved in a CSV file called `url_mapping.csv`.

### Persistence and Politeness

The crawler saves its BFS queue to a file (`queue.txt`) every time it finishes or gets interrupted (it catches `KeyboardInterrupt`). When you restart it, it picks up right where it left off by reloading the queue and checking which hash-files already exist on disk.

It also waits one second between requests (`time.sleep(1)`) and uses a custom User-Agent string (`IndexerBot/1.0 (educational purposes)`). This is basic web crawling etiquette. You do not want to hammer a server with hundreds of requests per second.

### Filtering

Not every link on Wikipedia is an article. The crawler filters out namespace pages (like `User:`, `Talk:`, `Wikipedia:`) by checking if the URL path after `/wiki/` contains a colon. It also skips "redlinks" (links to pages that do not exist yet) by checking the URL query parameters.

## Stage 2: The Parser

Once the crawler finishes, you have a folder full of raw HTML files. These are complete web pages with sidebars, footers, navigation menus, CSS class names, JavaScript, and all the other stuff browsers need. None of that is useful for search. The parser's job is to extract just the article text.

### Extracting the Content

The parser (`src/parser/parser.py`) opens each HTML file and uses BeautifulSoup to find the `div` with `id="mw-content-text"`. This is the div that contains the actual article body on Wikipedia pages. Everything else (the sidebar, the header, the footer) gets thrown away.

Within that div, it pulls out all `<p>` tags and joins their text together. It also strips citation markers like `[1]` and `[23]` using a regex.

### Two Outputs

The parser writes two versions of every document:

1. **Display text** (`data/processed_docs/display/000042.txt`): This is the cleaned-up, human-readable version. Paragraphs are preserved, capitalization is untouched. This is what you would show the user if they clicked on a result.

2. **Index text** (`data/processed_docs/index/000042.txt`): This is the version the search engine actually reads. It has been lowercased, stripped of all punctuation, and filtered to remove stopwords (common words like "the", "is", "and" that appear in almost every document and are not useful for distinguishing relevant results).

The parser also handles possessives, replacing curly apostrophes with straight ones and stripping `'s` endings before tokenizing.

### Metadata

A CSV file (`metadata.csv`) maps each document's numeric ID to its original URL and the hash-filename from the crawler. This is how the search engine knows which URL to show the user when it finds a match. Document IDs are zero-padded to six digits (like `000042`), which keeps the filenames sortable and consistent.

## Stage 3: The Inverted Index

This is where things get interesting. The inverted index is the core data structure that makes search fast. It lives in `src/engine_cpp/inverted_index.cpp` and `inverted_index.h`, and it is written in C++ for performance.

### What Is an Inverted Index?

Think of it like the index in the back of a textbook. If you look up the word "algorithm," the book's index tells you "pages 42, 78, 134." An inverted index does the same thing: for every word (called a "term") in the entire corpus, it stores a list of which documents contain that word and how many times it appears.

So if the word "ferrari" appears in documents 5, 23, and 891, the index stores:

```
"ferrari" -> [(5, 12), (23, 3), (891, 7)]
```

Those pairs are `(document_id, frequency)`. Document 5 mentions "ferrari" 12 times, document 23 mentions it 3 times, and so on. This list of pairs is called a "postings list."

### The TermID Optimization

Doing string comparisons during search is slow. Every time you look up a word, you are comparing characters one by one. The index avoids this by assigning each unique word a numeric ID when it first appears. There is a `vocabulary` hash map that goes from strings to integers:

```
"ferrari" -> 0
"championship" -> 1
"grand" -> 2
...
```

From that point on, all internal lookups use integers instead of strings. Looking up an integer in a hash map is faster than looking up a string because the hash computation is cheaper and the equality check is a single comparison instead of a character-by-character scan.

### Two-Phase Build

The index is built in two phases:

1. **Temp phase**: As documents are added, term frequencies are stored in a nested hash map (`tempIndex`). This is a map from `term_id` to another map from `doc_id` to `frequency`. The nested map makes it easy and fast to increment counts as you process tokens.

2. **Finalization**: Once all documents are loaded, the `finalizeIndex()` method converts the nested maps into sorted vectors of `(doc_id, frequency)` pairs. Sorted vectors are more cache-friendly and take less memory than hash maps. It then clears the temp structure to free memory.

During finalization, the index also precomputes the IDF (Inverse Document Frequency) for every term. I will explain what IDF means in the ranking section, but the key point is that it only needs to be calculated once, not on every query.

### IDF Formula

The IDF formula used here is:

$$\text{IDF}(t) = \ln\left(\frac{N - df(t) + 0.5}{df(t) + 0.5}\right)$$

Where $N$ is the total number of documents and $df(t)$ is the number of documents containing term $t$. One thing worth noting: this formula can produce negative values for terms that appear in more than half the documents. That is a known property of this particular IDF variant. It means extremely common terms actually get penalized, which makes sense intuitively (a word that appears everywhere is not very useful for distinguishing documents).

## Stage 4: BM25 Ranking

When you type a query, the engine needs to figure out which documents are most relevant. It does this using BM25, which stands for "Best Matching 25." It is a ranking function from the field of information retrieval, and it is used (in various forms) in production search engines including Elasticsearch and Apache Lucene.

### The Formula

For each document $d$ and query $q$, the BM25 score is:

$$\text{score}(d, q) = \sum_{t \in q} \text{IDF}(t) \cdot \frac{tf(t, d) \cdot (k_1 + 1)}{tf(t, d) + k_1 \cdot \left(1 - b + b \cdot \frac{|d|}{\text{avgdl}}\right)}$$

Here is what each piece means:

- **$tf(t, d)$**: How many times term $t$ appears in document $d$. More occurrences usually means more relevant.
- **$\text{IDF}(t)$**: How rare the term is across all documents. Rare terms are more informative.
- **$|d|$**: The length (word count) of document $d$.
- **$\text{avgdl}$**: The average document length across the whole corpus.
- **$k_1$**: Controls how much term frequency matters. Set to 1.5 in this project.
- **$b$**: Controls how much document length matters. Set to 0.75 in this project.

The intuition: if a term is rare (high IDF) and appears many times in a short document, that document gets a high score. If a document is very long, the $b$ parameter normalizes for that, because a longer document has more chances to contain any given word just by being longer.

### How the Ranker Works in Code

The `Ranker` class (`src/engine_cpp/ranking.cpp`) takes a query string and does the following:

1. Tokenizes the query by splitting on whitespace and punctuation.
2. Lowercases each token.
3. Filters out stopwords.
4. For each remaining query term, looks up its term ID in the index.
5. Retrieves the postings list for that term (every document containing the word and how many times).
6. For each document in the postings list, calculates the BM25 contribution of that term and adds it to the document's running score.
7. After processing all query terms, sorts documents by their accumulated scores.
8. Returns the top 10 document IDs.

One small optimization: the `Ranker` pre-allocates a `std::string` with `reserve(32)` to hold each token during parsing. This avoids repeated heap allocations as it processes the query character by character.

## Gluing It Together: Flask and Subprocess IPC

The interesting engineering challenge is that the search core is written in C++ but the web server is written in Python. These two need to talk to each other.

The solution is straightforward: the Flask app (`src/ui/app.py`) launches the compiled C++ binary as a subprocess when the server starts. It keeps the process alive for the entire lifetime of the server, communicating through stdin and stdout pipes.

### The Protocol

When the C++ engine starts up, it reads all 1,100 text files, builds the inverted index, and then prints a line like `LOAD_TIME_MS|142.567` to stdout. Flask reads this first line and logs the load time.

After that, the engine enters a loop: it reads one line from stdin (a query), processes it, and writes the results to stdout. Each result is a line in the format `doc_id|url`. After the last result, it writes `TIME_MS|0.018` (the query duration) and then `END_OF_RESULTS`.

That `END_OF_RESULTS` sentinel is important. Without it, Flask would not know when to stop reading lines from stdout. Since the number of results varies per query, you need some kind of terminator.

Flask then packages the results and timing data into a JSON response and sends it back to the browser.

### Why a Subprocess?

You might wonder why not just use a C++ extension or a shared library. The subprocess approach has some nice properties for a project like this. The C++ code stays completely standalone (no Python bindings or build system complexity). You can test the C++ engine independently by just piping queries into it from the terminal. And if the C++ process crashes, Flask can detect it without itself crashing.

The downside is that you are limited to text-based communication over pipes, which is not great for high-throughput scenarios. But for a local search engine handling one user, it works fine.

## The Frontend

The UI is minimal. There is a single HTML page (`src/ui/templates/index.html`) with a text input, a search button, and a results container. The CSS gives it a clean, Google-style look with a rounded search bar and a blue button.

The JavaScript (`src/ui/static/script.js`) does a few things:

1. When the user clicks "Search" or presses Enter, it sends a GET request to `/search?q=your+query`.
2. It displays a "Searching..." message while waiting.
3. When the response comes back, it renders each result as a link to the original Wikipedia page, along with the document ID and a line showing how many results were found and how long the query took.

The search time displayed in the UI is the pure C++ query time (not including network round-trip or index loading), so it reflects the actual ranking performance.

## Performance

The project includes two dedicated benchmark programs alongside the main engine.

### Index Build Time

The `index_benchmark.cpp` program measures how long it takes to load metadata, read 1,100 text files from disk, tokenize them, build the inverted index, and compute IDF values. Across 50 runs, the average was about 141.6 ms. Most of that time is disk I/O (reading files), not computation.

### Query Latency

The `query_benchmark.cpp` program loads the index, warms up with 10 queries, and then runs 1,000 iterations of the same query to measure pure ranking time. Results:

| Query                    | Average Latency  |
|:-------------------------|:-----------------|
| "Ferrari"                | 0.0122 ms        |
| "Grand Prix"             | 0.0186 ms        |
| Long multi-word phrase   | 0.0178 ms        |

That is roughly 0.01 to 0.02 milliseconds per query. Doing the math, the engine could handle over 50,000 searches per second on this dataset once the index is loaded. The pure query time accounts for less than 0.02% of the total end-to-end time in a cold start. The bottleneck is almost entirely disk I/O during index loading.

### Why C++ Makes a Difference

Using C++ for the search core is a deliberate choice. In-memory hash map lookups, integer comparisons instead of string comparisons, contiguous memory access through sorted vectors, and manual control over allocation all add up. These are the kinds of optimizations that matter when you are iterating over postings lists containing thousands of entries.

## Known Tradeoffs and Limitations

No project is perfect, and this one has some specific rough edges worth mentioning.

**No index persistence.** Every time you start the search engine, it rebuilds the entire index from text files on disk. For 1,100 documents this takes about 140 ms, which is fine. If you scaled to 100,000 documents, it would start to hurt. A real search engine would serialize the index to a binary format and load it directly.

**Negative IDF values.** The IDF formula used here can produce negative values for terms that appear in more than half the documents. This means that very common terms actually reduce a document's score. It is a known property of this BM25 variant, and for most queries it works fine. But it can produce surprising results for queries that only contain extremely common words.

**Single process.** The Flask server talks to exactly one C++ subprocess. If two users search at the same time, the second query has to wait for the first one to finish. This is not a problem for personal use, but it would not scale to a multi-user deployment.

**No snippet generation.** The results page shows document IDs and URLs but no text preview. A real search engine would show a short snippet of the matching text to help users decide which result to click. The display-text files exist for this purpose, but the feature is not wired up yet.

**Hardcoded paths.** Most file paths in the project are relative to the repo root (like `data/processed_docs/metadata.csv`). This works as long as you run everything from the right directory, but it is fragile. A more robust setup would use configuration files or environment variables.

## Wrapping Up

Building this project was a good exercise in understanding how search actually works at a low level. The things we use every day (Google, Elasticsearch, Solr) all rest on the same basic ideas: crawl pages, tokenize text, build an inverted index, rank with something like BM25. The scale is different, the optimizations are vastly more sophisticated, and there are entire research fields dedicated to each piece of the pipeline. But the core loop is the same.

If you are interested in trying it yourself, the whole thing runs locally. You need Python 3.8+ and a C++ compiler that supports C++17. Crawl some pages, parse them, compile the engine, start the server, and you have your own little search engine. It is not going to replace Google, but you will understand what Google is doing a little better.
