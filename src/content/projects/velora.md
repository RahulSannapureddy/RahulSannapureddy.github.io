---
title: "How We Built VELORA: A Multi-Algorithm Vehicle Routing System That Won Gold at KRITI 2026"
description: "A full-stack application and multi-algorithm vehicle routing system built for the KRITI 2026 tech competition."
pubDate: "Mar 31 2026"
tags: ["C++", "Next.js", "Optimization", "Algorithms", "React"]
---

# How We Built VELORA: A Multi-Algorithm Vehicle Routing System That Won Gold at KRITI 2026

This is a write-up of the project our team built for KRITI 2026, an intra-IIT Guwahati tech competition focused on optimization. The problem statement asked us to build a system that can assign vehicles to employees, pick them up from their homes, and drop them off at the office, all while minimizing costs and keeping ride times reasonable. If you have taken a course in combinatorial optimization or algorithms, you might recognize this as a variant of the Dial-A-Ride Problem (DARP). Our project, VELORA, ended up winning gold. This blog covers the overall architecture, the algorithms involved, and a detailed walkthrough of the metaheuristic engine I worked on: `god_vns`.

<br>

---

<br>

## The Problem: What Is DARP, and Why Is It Hard?

The Dial-A-Ride Problem is a generalization of the classic Vehicle Routing Problem with Time Windows (VRPTW). In standard VRP, you have a set of locations to visit and a fleet of vehicles, and you want to find routes that minimize total travel cost. DARP makes it harder by adding a constraint that every "request" has both a pickup and a delivery location, and each person riding in the vehicle has limits on how long they are willing to sit in it.

In our problem, each employee has:
- A home location (pickup) and an office location (delivery).
- An earliest pickup time and a latest arrival deadline.
- A priority level (some employees are more important to serve on time).
- A sharing preference (some employees prefer to ride alone, others can share with up to 2 or 3 others).
- A vehicle type preference (premium vs. normal).

Each vehicle has:
- A depot (starting location), a capacity, a cost-per-km rate, a speed, and a category.

The objective is a weighted combination of monetary cost (distance-based) and total employee ride time. Finding an optimal solution is NP-hard, so for any realistic input size, you need heuristics.

<br>

---

<br>

## System Architecture

VELORA is a full-stack application. The backend is C++ (compiled with g++ and C++17), and the frontend is a Next.js React web application. Here is how the pieces fit together:

```
User uploads CSVs (employees, vehicles, metadata)
        |
        v
  [Next.js Frontend]  --->  HTTP POST (multipart form)
        |
        v
  [Crow HTTP Server]  (C++ REST API on port 5555)
        |
        +--> Generates distance matrix (OSRM API or Haversine fallback)
        |
        +--> Saves CSVs + matrix to an isolated temp directory
        |
        +--> Spawns solver binaries in parallel threads:
        |       main_alns, main_bac, main_hetero, main_god, main_memetic
        |
        +--> Reads output CSVs from each solver
        |
        +--> Aggregates results into JSON and sends back to frontend
```

### The Server (`src/server/main.cpp`)

The backend uses the Crow library (a lightweight C++ HTTP framework, similar in spirit to Flask for Python). When the frontend posts a request, the server does the following:

1. Extracts the uploaded CSV data (employees, vehicles, metadata, baseline, and an optimization level/runtime limit).
2. Creates an isolated temporary directory (`tmp/req_<UUID>`) so that multiple requests can run concurrently without stepping on each other's files.
3. Parses the coordinates from the CSVs and builds a distance matrix. It first tries the OSRM (Open Source Routing Machine) public API via `curl` to get real road-network distances. If that fails (network issues, rate limits, or the metadata says `allow_external_maps=FALSE`), it falls back to computing Haversine (great-circle) distances locally. The matrix is split into blocks of 99 coordinates per request to stay within OSRM's limits, and each block is fetched in a separate thread.
4. Launches the compiled solver binaries as subprocesses in parallel using `std::thread`. Each solver gets the temp directory path as its argument, reads its inputs from there, and writes its output CSVs back into a subdirectory.
5. After all solvers finish, the server reads their output files, packages everything into a JSON response, and sends it back to the frontend.

### The Frontend

The frontend is a Next.js React application that provides a dashboard UI. Users upload their CSV files, configure the optimization level, and hit submit. Once the backend responds, the frontend displays the routing results, including vehicle assignments, pickup/drop times, and cost comparisons across the different algorithms.

<br>

---

<br>

## The Algorithm Suite

Our team built seven different solvers, each taking a different approach. This was partly strategic (the competition could favor different problem structures) and partly because having multiple algorithms lets you compare and pick the best solution for each input.

### ALNS (Adaptive Large Neighborhood Search)

ALNS is a popular metaheuristic for routing problems. The idea is to iteratively destroy part of a solution (remove some requests from their routes) and then repair it (reinsert them in better positions). The "adaptive" part means the algorithm tracks which destroy/repair operators have been performing well recently and gives them higher selection probabilities. Our ALNS implementation uses operators like random removal, worst-distance removal, and greedy reinsertion.

### Branch and Cut

This is the only exact method in the suite. Branch and Cut is an integer programming technique that systematically explores the solution space using a tree of linear programming relaxations, adding cutting planes to tighten the bounds. For small instances, it can find provably optimal solutions. For larger ones, it may time out, but it still provides good lower bounds.

### CRDP (Clustering-Routing-DP)

CRDP takes a decomposition approach. It first clusters employees geographically, then solves a routing subproblem for each cluster, and finally uses dynamic programming to stitch the cluster solutions together. This works well when employees are naturally grouped in neighborhoods.

### Heterogeneous DARP

This solver specifically handles the heterogeneous fleet aspect of the problem, where vehicles have different capacities, speeds, and cost structures. It models the vehicle-type compatibility constraints (premium vs. normal) directly in its construction heuristic.

### Memetic Algorithm

A memetic algorithm combines a genetic algorithm (population-based evolutionary search) with local search. It maintains a population of solutions, applies crossover and mutation to produce offspring, and then improves each offspring with a local search pass before selecting survivors. The crossover operator is route-based: it takes complete routes from one parent and fills the gaps using routes from the other parent.

### VNS (Variable Neighborhood Search)

The base VNS is a simpler version of the neighborhood search idea. It uses a small set of shaking operators and local search moves to escape local optima and explore different regions of the solution space.

### god_vns (Generic Optimization and Variable Neighborhood Search)

This is the solver I built, and the rest of this blog goes into its internals in detail.

<br>

---

<br>

## Deep Dive: The god_vns Engine

The name `god_vns` stands for Generic Optimization and Variable Neighborhood Search. It is a metaheuristic solver built from scratch in C++17 for this specific DARP variant. The design philosophy was: model the problem precisely (all the constraints, the cost structure, the priority system), build a solid initial solution, and then throw a structured search at it for as many iterations as the time limit allows.

### Data Model

The data model is defined across `model.h` and `model.cpp`. Here are the core types:

**NodeType** is an enum with three values: `PICKUP`, `DELIVERY`, and `DEPOT`. Every location in the problem is a node.

**Node** stores the ID, type, latitude/longitude, time window (`e` for earliest, `l` for latest), service time (`st`), load change (+1 for pickup, -1 for delivery), sharing preference (1 = ride alone, 2 = share with one other, 3 = share with two others), a waiting tariff type, and a priority level.

**Vehicle** stores the ID, depot node ID, capacity, speed, and cost parameters: `lambda_k` (fixed cost), `c_k` (cost per km beyond a free distance threshold `L`), `ct_k` (cost per minute of route duration), `cp` (cost per additional employee beyond the first), and `type_id` (0 = premium, 1 = normal).

**Request** ties a pickup node to a delivery node, stores the maximum ride time, and uses a bitmask (`compatible_vehicle_types`) to encode which vehicle categories this employee can ride in. If an employee prefers premium vehicles, only type 0 is set. If they accept any vehicle, both bits 0 and 1 are set.

**Route** holds a pointer to its assigned vehicle, a sequence of node IDs (just the pickups and deliveries, not the depot), and cached statistics: `f1` (monetary cost), `f2` (employee quality/discomfort), violation amounts for capacity, time windows, and ride time, plus a `stats_valid` flag for lazy recalculation.

**Solution** is a vector of Routes plus a list of unassigned request IDs. It tracks three cost components: `f1` (total monetary cost across all routes), `f2` (total quality cost, weighted by a factor `psi`), and `f3` (total penalty for constraint violations plus a huge penalty per unassigned request). The total objective is `f1 + f2 + f3`.

### The DARPInstance Container

`DARPInstance` (defined in `utils.h` and `utils.cpp`) holds everything about the problem instance: the list of all nodes, vehicles, and requests, the distance matrix, and several lookup tables for fast access (node-to-request mapping, request-to-pickup-node mapping, max ride times). It also maintains pre-allocated scratch arrays (`pickup_times_scratch`, `scratch_arrival`, etc.) to avoid repeated heap allocations during evaluation. This matters because the evaluation function runs millions of times during the search.

### Parameters (`params.h`)

The algorithm has a handful of tunable constants:

| Parameter | Value | Purpose |
|---|---|---|
| `ALPHA` | 1.0 | Penalty weight for ride-time violations |
| `BETA` | Dynamically set (1000 x max cost/km) | Penalty weight for time-window violations |
| `GAMMA` | 1,000,000 | Penalty weight for capacity violations |
| `F2_WEIGHT` | 0.25 | Weight for quality cost in route-level evaluation |
| `LOCAL_SEARCH_PSI` | 0.25 | Weight for quality cost during local search |
| `UNASSIGNED_PENALTY` | 1,000,000,000 | Per-request penalty for leaving an employee unassigned |
| `IMPROVEMENT_EPS` | 1.0 | Minimum improvement threshold to accept a local search move |
| `DEFAULT_MAX_ITERATIONS` | 1,000,000 | Maximum VNS iterations |
| `DEFAULT_H` | 5 | Default perturbation intensity |

A couple things to note here. `BETA` is not fixed at compile time. It is set dynamically when the vehicle data is loaded: the I/O code (`io.cpp`) scans all vehicles, finds the maximum cost-per-km value, and sets `BETA = 1000 * max_cost_per_km`. This scales the time-window penalty relative to the actual cost structure of the fleet, which prevents the penalty from being either too weak (allowing late deliveries) or too strong (making the search overly rigid).

The constraint penalty weights are intentionally asymmetric. Capacity violations carry a weight of 1,000,000, and unassigned requests cost 1,000,000,000 each. This hierarchy means the solver will do almost anything to avoid leaving an employee unassigned, will strongly avoid capacity violations, and will treat time-window violations with intermediate severity calibrated to the fleet's cost structure. Ride-time violations get the lightest penalty (`ALPHA = 1.0`) because the problem formulation uses infinite max ride times by default (the ride-time constraint is effectively relaxed).

### I/O and Data Loading (`io.cpp`)

The I/O layer handles four input files:

1. **`vehicles.csv`**: Each row is a vehicle with fields like ID, fuel type, category (premium/normal), capacity, cost per km, average speed, current latitude/longitude, and available-from time. The loader converts the HH:MM time string into minutes since midnight, creates a depot node at the vehicle's current location, and constructs the Vehicle object.

2. **`employees.csv`**: Each row is an employee with fields like ID, priority, pickup lat/lon, drop lat/lon, earliest pickup time, latest drop time, vehicle preference, and sharing preference. The loader creates both a pickup node and a delivery node for each employee, then registers a Request linking them. The node ID scheme is important: depot nodes get IDs 1 through `num_vehicles`, pickup nodes get IDs `num_vehicles + 1` through `num_vehicles + num_employees`, and delivery nodes get IDs `num_vehicles + num_employees + 1` through `num_vehicles + 2*num_employees`.

3. **`matrix.txt`**: A square matrix of pairwise distances (in km) between all employee pickup locations, vehicle depots, and the shared office (delivery) location. The matrix loading code (`loadMatrix`) remaps from the input matrix indices to the internal node ID scheme. Since all employees share the same office as their delivery location, the matrix expands the single "office" row/column to cover all delivery node IDs with identical distances.

4. **`metadata.csv`**: Contains key-value configuration pairs like `objective_cost_weight`, `objective_time_weight`, and per-priority delay allowances (`priority_X_max_delay_min`). These delay values let the solver relax the deadline for lower-priority employees by a configurable number of minutes.

The output is written to two CSV files: `output_vehicle.csv` (with the objective cost, total delay penalty, unassigned count, and per-assignment rows of vehicle ID, category, employee ID, pickup time, drop time) and `output_employees.csv` (employee ID, pickup time, drop time).

### Initial Solution Construction (`init_sol.cpp`)

The initial solution uses a greedy insertion heuristic:

1. Sort all requests by their delivery deadline (latest drop time, ascending). This ensures that tighter deadlines are handled first.
2. For each request in order, try inserting it into every compatible route at the best possible position. "Best position" means enumerating all (i, j) pairs where `i` is the position for the pickup node and `j > i` is the position for the delivery node, and picking the (i, j) that yields the lowest route cost.
3. If no feasible insertion exists, mark the request as unassigned.

This is an O(n^2 * m) process for n requests and m vehicles (with the inner loop being O(k^2) for route length k), but it produces a reasonable starting solution that the VNS can then improve.

### The Evaluation Engine (`evaluate.cpp`)

This is where things get interesting. The evaluation function is the heart of any metaheuristic: it is called every time a move is considered, so it needs to be both accurate and fast.

**`calculate_route_stats`** simulates the vehicle driving its route from start to finish. For each node in the sequence, it computes:
- The travel time from the previous node (distance / speed, converted to minutes).
- The arrival time and the service start time (clamped to the node's earliest time window).
- The waiting cost if applicable (looked up from a tariff table).
- The employee quality penalty: for pickups, the penalty grows if the vehicle arrives after the employee's earliest time (the employee waits); for deliveries, the penalty grows if the employee arrives before their latest time (wasted potential). Both are weighted by the employee's priority.
- The running load and capacity violations. The capacity check is not just "is the load above the vehicle's capacity." It also considers sharing preferences. If any currently-on-board employee has sharing preference `k`, then the effective capacity drops to `min(vehicle_capacity, k)`. So an employee who wants to ride alone (`sharing_preference = 1`) forces the effective capacity to 1 while they are on board.
- Time-window violations (weighted by priority).
- Ride-time violations (time from pickup service start to delivery service start, minus service time, compared against the max ride time).

The monetary cost `f1` for a route is: `lambda_k` (fixed cost if distance <= L, otherwise `lambda_k + c_k * (distance - L)`) plus `ct_k * duration` plus `cp * (num_passengers - 1)` plus waiting costs.

The quality cost `f2` is the sum of priority-weighted "closeness to ideal" penalties.

**`evaluate_solution`** aggregates across all routes and computes `f3 = alpha * total_ride_violations + beta * total_tw_violations + gamma * total_capacity_violations + UNASSIGNED_PENALTY * num_unassigned`. The total cost is `f1 + f2 + f3`.

**`insert_request_best_position`** is a heavily optimized function that finds the best (i, j) insertion point for a request into a route. It uses an incremental evaluation strategy: instead of recomputing the entire route cost from scratch for every (i, j) pair, it pre-computes a "base prefix" trajectory (the route with just the pickup inserted) and then reuses partial results when considering different delivery positions. When inserting the delivery node does not change the service start time of the next node (because the vehicle would have waited at the next stop anyway), the function skips re-simulating the rest of the route and instead computes the remaining cost from cached prefix/suffix deltas. This is an important performance optimization because this function is called inside the local search loop, which runs inside every VNS iteration.

**`validate_solution_integrity`** is a debug-time sanity check that verifies every request is either assigned to exactly one route or in the unassigned list.

### Variable Neighborhood Search (`vns.cpp`)

The VNS main loop (`vns1`) works as follows:

1. Start with the initial solution.
2. Apply local search to improve it.
3. Try to insert any unassigned requests.
4. Enter the main loop (up to `k_max` iterations or until the time limit expires):
   a. **Shake**: Apply a perturbation using the current neighborhood operator.
   b. **Local search**: Improve the perturbed solution.
   c. **Reinsert unassigned**: Try to fit any unassigned requests back in.
   d. **Accept or reject**: If the candidate cost is better than the best known, accept it and reset the neighborhood index to 1. Otherwise, reject the candidate (restore from backup) and advance the neighborhood index.

The search cycles through 3 neighborhood structures:

**Neighborhood 1: Move (`neighborhood_move`)** picks a random request from a random non-empty route, removes its pickup and delivery nodes, and inserts them at random positions in a randomly chosen compatible route. The parameter `h` controls how many such moves are performed in one shaking step. This operator handles inter-route relocation.

**Neighborhood 2: Swap (`neighborhood_swap`)** picks two random non-empty routes and exchanges subsets of their requests. It extracts `len1` random requests from route 1 and `len2` random requests from route 2 (where `len1` and `len2` are random values capped at `h`), checks vehicle-type compatibility in both directions, removes the selected requests from their current routes, and reinserts them into the other route at random positions. This is a cross-route exchange operator.

**Neighborhood 3: Chain (`neighborhood_chain`)** performs a chain relocation. Starting from a random route, it removes a random request and inserts it into another random compatible route. Then, it treats that destination route as the new source and repeats for `h` steps. This creates a ripple effect where a single chain move can redistribute multiple requests across multiple routes.

All three neighborhoods use a backup-and-restore mechanism. Before modifying any route, its current state (sequence, costs, violation amounts) is saved into a `RouteBackups` vector. If the overall move is rejected, the backups are restored and the solution is back to its previous state. This avoids expensive deep copies of the entire solution.

**Local search (`apply_local_search`)** iterates over every route. For each pickup-delivery pair in the route, it removes both nodes, calls `insert_request_best_position` to find the best reinsertion point, and keeps the move if it improves the route cost by at least `IMPROVEMENT_EPS`. This is essentially a relocate-within-route operator. After processing all routes, it calls `update_solution_costs` to refresh the global cost.

### The Main Loop Control Flow

The VNS uses a "first improvement" acceptance strategy with neighborhood cycling. If a neighborhood successfully reduces the global cost, the index resets to 1 (so Neighborhood 1 gets tried again). If it fails, the index advances to the next neighborhood. This is a standard Variable Neighborhood Descent pattern embedded within the VNS shaking loop.

The time limit is enforced by checking `std::chrono::high_resolution_clock` at the top of each iteration. The `god.cpp` entry point subtracts a small buffer (0.2 seconds) from the runtime limit to leave time for I/O after the search finishes.

### Why This Design Works

A few design choices in `god_vns` turned out to matter:

**Penalty-based feasibility relaxation.** Instead of strictly enforcing all constraints at all times, the solver allows temporarily infeasible solutions during the search. Constraint violations show up as penalties in the cost function, which lets the search explore regions of the solution space that a strictly feasible approach would never reach. The asymmetric penalty weights guide the search toward feasibility naturally: capacity violations are 6 orders of magnitude more expensive than ride-time violations, and unassigned requests are 3 orders above even that.

**Incremental evaluation.** The evaluation function caches route statistics and only recomputes them when a route's `stats_valid` flag is false. The `insert_request_best_position` function takes this further with its prefix-trajectory shortcutting. In a search that runs hundreds of thousands of iterations per second, these micro-optimizations compound.

**Scratch arrays.** The `DARPInstance` class pre-allocates several vectors (`pickup_times_scratch`, `scratch_arrival`, etc.) that are reused across evaluation calls. This avoids constant memory allocation and deallocation inside the hot loop.

**Dynamic BETA scaling.** Scaling the time-window penalty to the fleet's cost structure means the solver does not need manual tuning per instance. A fleet with expensive vehicles naturally gets stricter about on-time delivery, while a cheap fleet gets more flexibility.

<br>

---

<br>

## How Everything Connects: End-to-End Flow

Here is what happens when someone uses VELORA:

1. A user opens the web dashboard, uploads the employee CSV, vehicle CSV, and metadata CSV, selects an optimization level (which controls how much runtime each solver gets), and clicks "Optimize."
2. The frontend sends a multipart HTTP POST to the Crow server at port 5555.
3. The server creates a sandboxed temp directory, saves the uploaded files, and builds the distance matrix.
4. The server launches the active solvers (currently ALNS, Branch-and-Cut, Heterogeneous DARP, god_vns, and Memetic) in parallel threads.
5. Each solver reads the shared input files, runs its optimization, and writes its output CSVs into its own subdirectory.
6. The server collects all outputs, bundles them into a JSON response, and sends it back.
7. The frontend displays the results, showing the routing solution from each algorithm with cost breakdowns and vehicle/employee assignments.

The system can also be deployed using Docker (a `Dockerfile` and `docker-compose.yml` are included) which sets up both the C++ backend and the Node.js frontend in containers.

<br>

---

<br>

## Closing Thoughts

Building VELORA was a serious learning experience. The problem itself is not easy to model cleanly, especially with the heterogeneous fleet, sharing preferences, priority levels, and multi-part cost function. Getting the evaluation function right (down to the details of how sharing preferences interact with effective capacity) took multiple rounds of debugging.

If you are working on a similar project, here is what I would suggest. Start with the data model and I/O. Get that completely correct before touching any optimization logic. Write a `validate_solution_integrity` function early and call it often. And when you build your evaluation function, make it the single source of truth for cost computation so that every part of the codebase agrees on what a solution costs.

On the algorithm side, VNS with penalty-based feasibility relaxation turned out to be a solid foundation. It is simple enough to implement and debug, flexible enough to handle complex constraints, and fast enough (with incremental evaluation) to run a very large number of iterations within a tight time budget.
