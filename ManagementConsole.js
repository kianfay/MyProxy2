var ipc = require('node-ipc');
var readline = require('readline')

// Boolean for whether the ipc connection is active, for error diagnostic
var connected = false;

// Wait 10 seconds before retrying to reconnect, and set debugging off, and max retries to 3
ipc.config.retry = 1000;
ipc.config.silent = true;
ipc.config.maxRetries = 3;

// Sets up an ICP connection to the proxy servers IPC server
ipc.connectTo('proxyServerIPC', () => {
    console.log('Trying to connect to server...')
    
    ipc.of['proxyServerIPC'].on('connect', () => {
        connected = true;
        console.log('Connected to server!')

        // Get a list of blacklisted urls and print it (in callback below)
        ipc.of['proxyServerIPC'].emit('queryBlacklist')

        console.log('To request a url be added, type it in and hit the enter key.\n')

/*      Set up an interface to listen for input. When a line is returned,
**      it gets sent to the proxy server to be added to the blacklist */
        var readLineInterface = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        // When the user hits enter, send the current line to the server to add to the blacklist
        readLineInterface.on('line', (input) => {
            ipc.of['proxyServerIPC'].emit('addToBlacklist', input);
        });

        // If the user closes the interface (most likely by hitting ctrl-c), it shows up
        readLineInterface.on('close', (input) => {
            console.log("The interface to add URLs to the blacklist has been severed. Restart to reconnect.")
        });
    });

    ipc.of['proxyServerIPC'].on('error', error => {
        connected ?
            console.log('Error during connection...\n' + error + '\n')
            :
            console.log('Error connecting with the proxy server...\n' + error + '\n');

    });

    ipc.of['proxyServerIPC'].on('HTTPReq', message => {
        console.log(message);
    })

    ipc.of['proxyServerIPC'].on('ConnectReq', message => {
        console.log(message);
    })

    // On request of a blacklist from this console, the server should broadcast
    // an array of blacklisted URLs. We recieve them here.
    ipc.of['proxyServerIPC'].on('BlacklistListing', message => {
        
        console.log('Current proxy blacklist: ' + message)
    })
});