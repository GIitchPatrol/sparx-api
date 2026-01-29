const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

let jobQueue = [];
let jobResults = {};
let lastWorkerHeartbeat = null;

// Heartbeat endpoint - worker pings this every 10 seconds
app.post('/api/worker-heartbeat', (req, res) => {
    lastWorkerHeartbeat = Date.now();
    res.json({ success: true });
});

// Check if worker is online (heartbeat within last 15 seconds)
function isWorkerOnline() {
    if (!lastWorkerHeartbeat) return false;
    const timeSinceHeartbeat = Date.now() - lastWorkerHeartbeat;
    return timeSinceHeartbeat < 15000; // 15 seconds
}

app.post('/api/sparx-login', async (req, res) => {
    const { schoolName, username, password } = req.body;
    
    if (!schoolName || !username || !password) {
        return res.status(400).json({ 
            error: 'Missing required fields: schoolName, username, password' 
        });
    }
    
    // Check if worker is online IMMEDIATELY
    if (!isWorkerOnline()) {
        return res.status(503).json({
            success: false,
            message: 'Worker is currently offline. Please try again later.'
        });
    }
    
    const jobId = Date.now().toString();
    
    jobQueue.push({
        id: jobId,
        schoolName,
        username,
        password,
        timestamp: new Date()
    });
    
    const maxWaitTime = 40000; // 40 seconds (bit more than Discord's 30s)
    const checkInterval = 1000;
    let waited = 0;
    
    while (waited < maxWaitTime) {
        if (jobResults[jobId]) {
            const result = jobResults[jobId];
            delete jobResults[jobId];
            return res.json({
                success: result.success,
                message: result.success ? 'Login successful!' : 'Login failed',
                error: result.error || null,
                homeworks: result.homeworks || []
            });
        }
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waited += checkInterval;
    }
    
    jobQueue = jobQueue.filter(j => j.id !== jobId);
    
    res.status(408).json({
        success: false,
        message: 'Login timed out.',
        homeworks: []
    });
});

app.get('/api/get-job', (req, res) => {
    if (jobQueue.length === 0) {
        return res.json({ job: null });
    }
    
    const now = Date.now();
    jobQueue = jobQueue.filter(job => {
        const age = now - new Date(job.timestamp).getTime();
        return age < 60000; // 1 minute
    });
    
    if (jobQueue.length === 0) {
        return res.json({ job: null });
    }
    
    const job = jobQueue.shift();
    res.json({ job });
});

app.post('/api/report-result', (req, res) => {
    const { jobId, success, error, homeworks } = req.body;
    
    jobResults[jobId] = {
        success,
        error,
        homeworks: homeworks || [],
        completedAt: new Date()
    };
    
    setTimeout(() => {
        delete jobResults[jobId];
    }, 300000);
    
    res.json({ success: true });
});

app.get('/api/status/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    
    const inQueue = jobQueue.find(j => j.id === jobId);
    if (inQueue) {
        return res.json({ status: 'queued', message: 'Job is waiting to be processed' });
    }
    
    const result = jobResults[jobId];
    if (result) {
        return res.json({ 
            status: 'completed', 
            success: result.success,
            error: result.error,
            homeworks: result.homeworks || [],
            completedAt: result.completedAt
        });
    }
    
    res.json({ status: 'processing', message: 'Job is being processed' });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'API is running', 
        queueSize: jobQueue.length,
        workerOnline: isWorkerOnline(),
        lastHeartbeat: lastWorkerHeartbeat ? new Date(lastWorkerHeartbeat).toISOString() : null
    });
});

app.listen(PORT, () => {
    console.log(`API running on port ${PORT}`);
});
