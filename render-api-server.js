const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Store pending jobs
let jobQueue = [];
let jobResults = {};

// API endpoint - receives requests and waits for completion
app.post('/api/sparx-login', async (req, res) => {
    const { schoolName, username, password } = req.body;

    if (!schoolName || !username || !password) {
        return res.status(400).json({ 
            error: 'Missing required fields: schoolName, username, password' 
        });
    }

    // Create job ID
    const jobId = Date.now().toString();
    
    // Add to queue
    jobQueue.push({
        id: jobId,
        schoolName,
        username,
        password,
        timestamp: new Date()
    });

    // Wait for result (timeout after 2 minutes)
    const maxWaitTime = 120000; // 2 minutes
    const checkInterval = 1000; // Check every second
    let waited = 0;

    while (waited < maxWaitTime) {
        // Check if result is available
        if (jobResults[jobId]) {
            const result = jobResults[jobId];
            return res.json({
                success: result.success,
                message: result.success ? 'Login successful!' : 'Login failed',
                error: result.error || null
            });
        }

        // Wait 1 second before checking again
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waited += checkInterval;
    }

    // Timeout
    res.status(408).json({
        success: false,
        message: 'Login timed out. Worker may not be running.'
    });
});

// Endpoint for your local computer to fetch jobs
app.get('/api/get-job', (req, res) => {
    if (jobQueue.length === 0) {
        return res.json({ job: null });
    }

    const job = jobQueue.shift(); // Get first job
    res.json({ job });
});

// Endpoint for your local computer to report results
app.post('/api/report-result', (req, res) => {
    const { jobId, success, error } = req.body;
    
    jobResults[jobId] = {
        success,
        error,
        completedAt: new Date()
    };

    res.json({ success: true });
});

// Endpoint to check job status
app.get('/api/status/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    
    // Check if in queue
    const inQueue = jobQueue.find(j => j.id === jobId);
    if (inQueue) {
        return res.json({ status: 'queued', message: 'Job is waiting to be processed' });
    }

    // Check if completed
    const result = jobResults[jobId];
    if (result) {
        return res.json({ 
            status: 'completed', 
            success: result.success,
            error: result.error,
            completedAt: result.completedAt
        });
    }

    res.json({ status: 'processing', message: 'Job is being processed' });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'API is running', queueSize: jobQueue.length });
});

app.listen(PORT, () => {
    console.log(`API running on port ${PORT}`);
});
