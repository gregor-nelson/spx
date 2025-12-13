# SPX Options Monitor - Deployment

## 1. Copy to Server

```bash
rsync -avz --exclude '__pycache__' --exclude '*.pyc' \
    SPX/ debian@glkn.xyz:/opt/spx/
```

## 2. Install Dependencies

```bash
cd /opt/spx
pip install -r requirements.txt
```

## 3. Configure

```bash
# Set API key
echo "POLYGON_API_KEY=your_key_here" > /opt/spx/.env
chmod 600 /opt/spx/.env

# Set frontend base path for /spx routing
# Edit static/js/config.js, change apiBase: '' to apiBase: '/spx'
```

## 4. nginx

```bash
sudo cp /opt/spx/deploy/spx.nginx.conf /etc/nginx/snippets/spx.conf

# Add to your server block in sites-available:
# include /etc/nginx/snippets/spx.conf;

sudo nginx -t && sudo systemctl reload nginx
```

## 5. systemd

```bash
sudo cp /opt/spx/deploy/spx.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable spx
sudo systemctl start spx
```

## 6. Scheduler (Optional)

The scheduler polls Polygon during market hours. Run separately:

```bash
# As a second service, or manually:
cd /opt/spx/src && python scheduler.py
```

Or create `spx-scheduler.service` if you want it managed by systemd.

## Commands

```bash
sudo systemctl status spx
sudo systemctl restart spx
journalctl -u spx -f
curl http://127.0.0.1:5050/api/health
```
