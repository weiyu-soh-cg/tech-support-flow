require('dotenv').config();
// -----------------------------------------------------------------------------
// TaskRouter web server
// 
// Easy to use.
// Install modules.
//  $ npm install --save express
//  $ npm install --save twilio
//  
// Run the web server. Default port is hardcoded to 8000.
//  $ node websever.js
// 
// -----------------------------------------------------------------------------
console.log("+++ TaskRouter application web server is starting up, version 4.0.");
// -----------------------------------------------------------------------------
// 
var makeRequest = require('request');
// 
// -----------------------------------------------------------------------------
// $ npm install express --save
const express = require('express');
const path = require('path');
const url = require("url");
// When deploying to Heroku, must use the keyword, "PORT".
// This allows Heroku to override the value and use port 80. And when running locally can use other ports.
const PORT = process.env.PORT || 8000;
var app = express();
//
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// TaskRouter

const taskrouter = require('twilio').jwt.taskrouter;
const ClientCapability = require('twilio').jwt.ClientCapability;

const util = taskrouter.util;

// TaskRouter worker application password to obtain an access token.
const TR_TOKEN_PASSWORD = process.env.TR_TOKEN_PASSWORD;

const TR_ACCOUNT_SID = process.env.TR_ACCOUNT_SID;
const TR_AUTH_TOKEN = process.env.TR_AUTH_TOKEN;
const WORKSPACE_SID = process.env.WORKSPACE_SID;
const TWILIO_TWIML_APP_SID = process.env.TWILIO_TWIML_APP_SID;

console.log("+ TR_ACCOUNT_SID   :" + TR_ACCOUNT_SID + ":");
console.log("+ WORKSPACE_SID :" + WORKSPACE_SID + ":");
//
const trClient = require('twilio')(TR_ACCOUNT_SID, TR_AUTH_TOKEN);
// Test that the TaskRouter API is working:
trClient.taskrouter.v1.workspaces(WORKSPACE_SID)
        .fetch()
        .then(workspace => {
            console.log("+ Workspace friendlyName: " + workspace.friendlyName);
        });

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
var returnMessage = '';
function sayMessage(message) {
    returnMessage = returnMessage + message + "<br>";
    console.log(message);
}

// -----------------------------------------------------------------------------
// tfptaskrouter: Twilio Conversations functions
// -----------------------------------------------------------------------------
// 
// -----------------------------------------------------------------------------
// Generate a worker's TaskRouter token
// Documentation: https://www.twilio.com/docs/taskrouter/js-sdk-v1/workspace

const TASKROUTER_BASE_URL = 'https://taskrouter.twilio.com';
const version = 'v1';
function generateToken(workerSid) {
    const TaskRouterCapability = taskrouter.TaskRouterCapability;
    const Policy = TaskRouterCapability.Policy;

    const capability = new TaskRouterCapability({
        accountSid: TR_ACCOUNT_SID,
        authToken: TR_AUTH_TOKEN,
        workspaceSid: WORKSPACE_SID,
        channelId: workerSid,
        ttl: 3600,
        workerSid: workerSid
    });

    // Add required TaskRouter policies
    const workerPolicies = util.defaultWorkerPolicies(WORKSPACE_SID, workerSid);
    workerPolicies.forEach(policy => capability.addPolicy(policy));

    // Allow WebSocket connections
    const eventBridgePolicies = util.defaultEventBridgePolicies(TR_ACCOUNT_SID, workerSid);
    eventBridgePolicies.forEach(policy => capability.addPolicy(policy));

    const voiceCapability = new ClientCapability({
        accountSid: TR_ACCOUNT_SID,
        authToken: TR_AUTH_TOKEN,
    });

    voiceCapability.addScope(
        new ClientCapability.IncomingClientScope(workerSid)
    );
    voiceCapability.addScope(
        new ClientCapability.OutgoingClientScope({
            applicationSid: process.env.TWILIO_TWIML_APP_SID,
            clientName: workerSid,
        })
    );

    const workerToken = capability.toJwt();
    const voiceToken = voiceCapability.toJwt();

    return { 
        workerToken, 
        voiceToken,
        applicationSid: TWILIO_TWIML_APP_SID  // Include this
    };
}

// -----------------------------------------------------------------------------
// Web server interface to call functions.
// 
// -----------------------------------------------------------------------------
// app.get('/tfptaskrouter/generateToken', function (req, res) {
//     sayMessage("+ Generate Token.");
//     if (req.query.tokenPassword) {
//         theTokenPassword = req.query.tokenPassword;
//         if (theTokenPassword === TR_TOKEN_PASSWORD) {
//             if (req.query.clientid) {
//                 theClientid = req.query.clientid;
//                 var workerNameQuery = "`name IN ['" + theClientid + "']}`";
//                 trClient.taskrouter.v1.workspaces(WORKSPACE_SID)
//                         .workers
//                         .list({targetWorkersExpression: workerNameQuery})
//                         .then(workers => {
//                             if (workers.length === 0) {
//                                 res.status(404).send("No worker found with the given clientid");
//                                 console.log("No worker found with the given clientid");
//                             } else {
//                                 const worker = workers[0];
//                                 const token = generateToken(worker.sid, theTokenPassword);
//                                 res.send(token);
//                             }
//                         })
//                         .catch(error => {
//                             console.error("Error fetching workers:", error);
//                             res.status(500).send("Internal server error");
//                         });
//             } else {
//                 sayMessage("- Parameter required: clientid.");
//                 res.sendStatus(502);
//             }
//         } else {
//             sayMessage("- Required, valid: tokenPassword.");
//             res.sendStatus(502);
//         }
//     } else {
//         sayMessage("- Parameter required: tokenPassword.");
//         res.sendStatus(502);
//     }
// });
app.get('/tfptaskrouter/generateToken', function (req, res) {
    sayMessage("+ Generate Token.");
    if (req.query.tokenPassword) {
        theTokenPassword = req.query.tokenPassword;
        if (theTokenPassword === TR_TOKEN_PASSWORD) {
            // First, let's fetch and print all workers
            trClient.taskrouter.v1.workspaces(WORKSPACE_SID)
                .workers
                .list()
                .then(allWorkers => {
                    console.log("All workers (raw response):");
                    allWorkers.forEach(worker => {
                        console.log(JSON.stringify(worker, null, 2));
                    });
                
                    console.log("\nSummarized worker info:");
                    allWorkers.forEach(worker => {
                        console.log(`- ${worker.friendlyName} (SID: ${worker.sid})`);
                    });
                    
                    // Now proceed with the original logic
                    if (req.query.clientid) {
                        theClientid = req.query.clientid;
                        var workerNameQuery = `friendly_name CONTAINS '${theClientid}'`;
                        //var workerNameQuery = `friendly_name CONTAINS 'Agent 1'`;
                        console.log(`Worker query: ${workerNameQuery}`);
                        return trClient.taskrouter.v1.workspaces(WORKSPACE_SID)
                            .workers
                            .list({targetWorkersExpression: workerNameQuery})
                            .then(workers => {
                                console.log(`Query returned ${workers.length} worker(s):`);
                                workers.forEach(worker => {
                                    console.log(`- friendlyName: ${worker.friendlyName}, SID: ${worker.sid}`);
                                });
                                return workers; // Return the workers for the next .then() block
                            });
                    } else {
                        throw new Error("Parameter required: clientid");
                    }
                })
                .then(workers => {
                    if (workers.length === 0) {
                        console.log("No worker found with the given clientid");
                        res.status(404).send("No worker found with the given clientid");
                    } else {
                        const worker = workers[0];
                        const tokens = generateToken(worker.sid);  // This line changed
                        res.json(tokens);  // This line changed
                    }
                })
                .catch(error => {
                    console.error("Error:", error.message);
                    res.status(500).send("Internal server error: " + error.message);
                });
        } else {
            sayMessage("- Required, valid: tokenPassword.");
            res.sendStatus(502);
        }
    } else {
        sayMessage("- Parameter required: tokenPassword.");
        res.sendStatus(502);
    }
});

const VoiceResponse = require('twilio').twiml.VoiceResponse;

app.post('/voice', (req, res) => {
    const twiml = new VoiceResponse();

    // Get the worker's client name from the request
    const workerClientName = req.body.Worker;

    if (workerClientName) {
        // If a worker is specified, connect to that worker
        const dial = twiml.dial();
        dial.client(workerClientName);
    } else {
        // If no worker is specified, this is likely an outbound call from a worker
        // You can customize this behavior as needed

        twiml.say('Thanks for calling. Please wait while we connect you to an agent.');
        
        // You might want to add logic here to find an available worker and connect to them
        // For now, we'll just hang up after the message
        twiml.hangup();
    }

    res.type('text/xml');
    res.send(twiml.toString());
});

// -----------------------------------------------------------------------------
var arrayActivities = [];
var theFriendlyName = "";
var theList = "";
app.get('/tfptaskrouter/getTrActivites', function (req, res) {
    sayMessage("+ getTrActivites for WORKSPACE_SID: " + WORKSPACE_SID);
    trClient.taskrouter.v1.workspaces(WORKSPACE_SID)
            .fetch()
            .then(workspace => {
                theFriendlyName = workspace.friendlyName;
                console.log("+ workspace friendlyName: " + theFriendlyName);
                theList = theFriendlyName + ":workspacefriendlyname";
                trClient.taskrouter.v1
                        .workspaces(WORKSPACE_SID).activities.list()
                        .then((activities) => {
                            console.log("++ Load workspace activies.");
                            activities.forEach((activity) => {
                                // console.log("+ SID: " + activity.sid + " : " + activity.friendlyName);
                                arrayActivities.push([activity.sid, activity.friendlyName]);
                                theList = theList + ":" + activity.sid + ":" + activity.friendlyName;
                            });
                            console.log(theList);
                            res.send(theList);
                        });
            });
});

// -----------------------------------------------------------------------------
function taskSetCompleted(taskSid) {
    trClient.taskrouter.v1.workspaces(WORKSPACE_SID)
            .tasks(taskSid)
            .update({
                assignmentStatus: 'completed',
                reason: 'Status was "wrapping", changed to: "completed".'
            })
            .then(task => console.log("+++ Task set to status: " + task.assignmentStatus));
}
function taskSetWrapToCompleted(taskSid) {
    console.log("++ taskSid=" + taskSid);
    trClient.taskrouter.v1.workspaces(WORKSPACE_SID)
            .tasks(taskSid)
            .fetch()
            .then(task => {
                assignmentStatus = task.assignmentStatus;
                console.log("++ "
                        + "SID: " + task.sid
                        + " assignmentStatus: " + assignmentStatus
                        + " taskQueueFriendlyName: " + task.taskQueueFriendlyName
                        );
                if (assignmentStatus === "wrapping") {
                    taskSetCompleted(task.sid);
                    console.log("++ Task set to completed.");
                    return("++ Task set to completed.");
                }
            });
}

app.get('/tfptaskrouter/taskSetWrapToCompleted', function (req, res) {
    sayMessage("+ Change task status from 'wrapping' to 'completed'.");
    if (req.query.taskSid) {
        res.send(taskSetWrapToCompleted(req.query.taskSid));
    } else {
        sayMessage("- Parameter required: taskSid.");
        res.sendStatus(502);
    }
});

// -----------------------------------------------------------------------------
function conferenceCompleted(conferenceSid) {
    console.log("++ conferenceName=" + conferenceSid);
    trClient.conferences(conferenceSid)
            .update({status: 'completed'})
            .then(conference => {
                console.log("++ Conference ended, set to completed: " + conference.friendlyName);
                return("++ Conference ended");
            });
}

app.get('/tfptaskrouter/conferenceCompleted', function (req, res) {
    sayMessage("+ Received a request to end a conference call.");
    if (req.query.conferenceSid) {
        res.send(conferenceCompleted(req.query.conferenceSid));
    } else {
        sayMessage("- Parameter required: conferenceSid.");
        res.sendStatus(502);
    }
});

// -----------------------------------------------------------------------------
// Web server basics
// -----------------------------------------------------------------------------

app.get('/hello', function (req, res) {
    res.send('+ hello there.');
});
// -----------------------------------------------------------------------------
app.use(express.static('docroot'));
app.use(function (err, req, res, next) {
    console.error(err.stack);
    res.status(500).send('HTTP Error 500.');
});
app.listen(PORT, function () {
    console.log('+ Listening on port: ' + PORT);
});
