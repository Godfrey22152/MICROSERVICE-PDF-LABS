# pdf-labs — Kubernetes Manifests

Complete production-ready Kubernetes manifests for the pdf-labs
microservice application on a self-hosted kubeadm cluster with OpenEBS.

---

## File Overview

| File | Purpose |
|------|---------|
| `00-namespace.yaml` | `pdf-labs` namespace |
| `01-configmap.yaml` | App config + MongoDB replica-set config |
| `02-secrets.yaml` | JWT secret + ConvertAPI secret (base64) |
| `03-storageclass.yaml` | OpenEBS LocalPV Hostpath StorageClass |
| `04-mongo-statefulset.yaml` | MongoDB 3-replica StatefulSet + headless Service |
| `05-mongo-replicaset-init-job.yaml` | One-time Job to initialise `rs0` + create DBs |
| `06-deployments.yaml` | All 13 microservice Deployments |
| `07-services.yaml` | ClusterIP services + LoadBalancer for account-service |
| `08-ingress.yaml` | NGINX Ingress routing all paths |
| `09-hpa.yaml` | HorizontalPodAutoscalers for CPU-intensive services |
| `10-pdb.yaml` | PodDisruptionBudgets for HA |

---

## Prerequisites

### 1. OpenEBS (storage)
```bash
kubectl apply -f https://openebs.github.io/charts/openebs-operator.yaml
# Wait for all OpenEBS pods to be Running
kubectl get pods -n openebs
kubectl get pods -n openebs --watch
```

#### Ensure the storage path exists on every node
OpenEBS LocalPV Hostpath stores volume data in a directory on the node's local filesystem. The default path used in the manifest is `/var/openebs/local`. You need to confirm this directory exists (or create it) on every worker node that might schedule a MongoDB pod:
```
# Run this on each node
sudo mkdir -p /var/openebs/local
sudo chmod 777 /var/openebs/local
```
If you prefer a different path (e.g. a dedicated disk mounted at `/mnt/data`), change the `BasePath` in `03-storageclass.yaml` before applying.

### 2. NGINX Ingress Controller (bare-metal)
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.1/deploy/static/provider/baremetal/deploy.yaml
kubectl get pods -n ingress-nginx
```

### 3. Metrics Server (required for HPA)
```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

### 4. (Optional) cert-manager for TLS
```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
```

---

## Before You Apply

### Step A — Fill in Secrets (`02-secrets.yaml`)
Replace the placeholder base64 values with your real secrets:
```bash
# Generate JWT_SECRET
echo -n "your-jwt-secret-min-32-chars" | base64

# Generate CONVERTAPI_SECRET
echo -n "your-convertapi-secret" | base64
```
Edit `02-secrets.yaml` and paste the output values.

### Step B — Fill in Image References (`06-deployments.yaml`)
Replace every `REGISTRY/SERVICE_NAME:TAG` with your actual image,
for example:
```yaml
image: docker.io/myorg/account-service:v1.0.0
```
If pulling from a private registry, create an image pull secret:
```bash
kubectl create secret docker-registry regcred \
  --docker-server=REGISTRY \
  --docker-username=USER \
  --docker-password=PASS \
  --namespace=pdf-labs
```
Then add to each Deployment's spec.template.spec:
```yaml
imagePullSecrets:
  - name: regcred
```

### Step C — Update the Ingress host (`08-ingress.yaml`)
Replace `pdf-labs.example.com` with your real domain.

---

## Deployment Order

Apply in **strict order**. Wait between steps as noted.

```bash
# 1. Namespace first
kubectl apply -f 00-namespace.yaml

# 2. Config and secrets
kubectl apply -f 01-configmap.yaml
kubectl apply -f 02-secrets.yaml

# 3. Storage
kubectl apply -f 03-storageclass.yaml

# 4. MongoDB StatefulSet + headless service
kubectl apply -f 04-mongo-statefulset.yaml

# Wait for all 3 MongoDB pods to be Running
kubectl rollout status statefulset/mongo-pdf-labs -n pdf-labs
# Or watch:
kubectl get pods -n pdf-labs -l app=mongo-pdf-labs -w

# 5. Initialise MongoDB replica set (run ONCE)
kubectl apply -f 05-mongo-replicaset-init-job.yaml

# Watch job completion
kubectl logs -f job/mongo-replicaset-init -n pdf-labs

# 6. Microservice Deployments
kubectl apply -f 06-deployments.yaml

# 7. Services
kubectl apply -f 07-services.yaml

# 8. Ingress
kubectl apply -f 08-ingress.yaml

# 9. HPA (requires metrics-server)
kubectl apply -f 09-hpa.yaml

# 10. PodDisruptionBudgets
kubectl apply -f 10-pdb.yaml
```

Or apply everything at once (after the MongoDB wait):
```bash
kubectl apply -f 00-namespace.yaml -f 01-configmap.yaml -f 02-secrets.yaml \
  -f 03-storageclass.yaml -f 04-mongo-statefulset.yaml
# --- wait for mongo pods ---
kubectl apply -f 05-mongo-replicaset-init-job.yaml
# --- wait for job completion ---
kubectl apply -f 06-deployments.yaml -f 07-services.yaml \
  -f 08-ingress.yaml -f 09-hpa.yaml -f 10-pdb.yaml
```

---

## Verification

```bash
# All pods
kubectl get pods -n pdf-labs

# MongoDB replica set status
kubectl exec -n pdf-labs mongo-pdf-labs-0 -- mongosh --quiet --eval "rs.status()"

# account-service LoadBalancer external IP
kubectl get svc account-service -n pdf-labs

# Ingress
kubectl get ingress -n pdf-labs

# HPA status
kubectl get hpa -n pdf-labs
```

---

## Health Check Paths

Every microservice Deployment uses `/health` for all three probes
(startupProbe, livenessProbe, readinessProbe). If any service
exposes its health endpoint on a different path, update the
`httpGet.path` field in that Deployment accordingly.

---

## MongoDB Connection Strings

All MONGO_URI values use the full replica-set connection string:
```
mongodb://mongo-pdf-labs-0.mongo-pdf-labs:27017,
          mongo-pdf-labs-1.mongo-pdf-labs:27017,
          mongo-pdf-labs-2.mongo-pdf-labs:27017
          /<dbname>?replicaSet=rs0
```
This ensures writes always go to the PRIMARY and reads can be
distributed across SECONDARY members.

---

## Services That Use CONVERTAPI_SECRET

The following services require a valid ConvertAPI secret:
- `pdf-to-word-service`
- `word-to-pdf-service`
- `edit-pdf-service`
- `sheetlab-service`

Obtain your secret from https://www.convertapi.com/

---

## TLS / HTTPS

Uncomment the `tls` block in `08-ingress.yaml` and the
cert-manager annotation after installing cert-manager and
creating a `ClusterIssuer` named `letsencrypt-prod`.
