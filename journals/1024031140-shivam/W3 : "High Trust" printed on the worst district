# Week 3 : "High Trust" Printed on the Worst District

# k-means Cluster Indices Are Not Ranks

## Error:

No exception, no empty response. `GET /api/geo/districts`
returned a district heatmap whose labels were inverted:

> [{"name":"...","avg_score":641.2,"default_rate":0.27,
>   "cluster":0,"label":"High Trust"},
>  {"name":"...","avg_score":752.8,"default_rate":0.11,
>   "cluster":2,"label":"Emerging / Needs
>   Trust-Building"}, ...]

The district labelled **High Trust** had the *lowest*
average score on the page, and the highest default rate.

## Relevant Context

The endpoint clusters the ten districts on three
standardised features and hands back a label per district:

``` python
# app/ml/clustering.py
CLUSTER_LABELS_BY_RANK = ["High Trust", "Moderate",
                          "Emerging / Needs Trust-Building"]

feature_cols = ["avg_score", "default_rate", "shg_density"]
X = StandardScaler().fit_transform(df[feature_cols])

km = KMeans(n_clusters=n_clusters, n_init=10,
            random_state=42)
df["cluster"] = km.fit_predict(X)
```

My first version took the label straight off the cluster
index:

``` python
df["label"] = df["cluster"].map(
    lambda c: CLUSTER_LABELS_BY_RANK[c])
```

## Key Observation

A k-means cluster index carries no meaning whatsoever. It
is the order in which the centroids happened to be
initialised, nothing more. `cluster == 0` is not "the best
cluster"; it is "the cluster that was created first".

Mapping an ordered list of labels onto an unordered index
produces a result that is confidently, invisibly wrong --
the response is well-formed, every district has a label,
and the colours on the heatmap look fine.

## Solution

Rank the clusters by the quantity the labels are actually
about, and map the labels onto that ranking:

``` python
# Rank clusters by mean avg_score so labels are meaningful
# ("High Trust" is always the best-scoring cluster), not
# just an arbitrary k-means index.
cluster_rank = (
    df.groupby("cluster")["avg_score"]
      .mean().sort_values(ascending=False).index.tolist()
)
label_for_cluster = {}
for rank, cluster_id in enumerate(cluster_rank):
    if n_clusters == len(CLUSTER_LABELS_BY_RANK):
        label_for_cluster[cluster_id] = \
            CLUSTER_LABELS_BY_RANK[rank]
    else:
        label_for_cluster[cluster_id] = f"Cluster {rank + 1}"
```

`random_state=42` stays fixed as well, so two consecutive
page loads over unchanged data cannot return different
cluster numbers for the same district.

The regression test asserts the property rather than the
numbers, so it does not need updating when the data does:

> the district with the highest average score must carry
> the label "High Trust"

**Because**

An unsupervised algorithm returns a *partition*, not an
*ordering*. Any human-readable meaning attached to its
output has to be derived from a feature you chose, not
from the algorithm's internal bookkeeping.

This is the failure mode I now look for first in anything
ML-backed on this dashboard: nothing crashed, nothing was
empty, and the meaning was exactly backwards.
