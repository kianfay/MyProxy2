var ipc = require('node-ipc');

// Boolean for whether the ipc connection is active, for error diagnostic
var connected = false;

// Wait 10 seconds before retrying to reconnect
ipc.config.retry = 1000;
ipc.config.silent = true;
ipc.config.maxRetries = 3;

ipc.connectTo('proxyServerIPC', () => {
    console.log('Trying to connect to server')
    
    ipc.of['proxyServerIPC'].on('connect', () => {
        connected = true;
        console.log('Connected to server')
        ipc.of['proxyServerIPC'].emit('addToBlacklist', "Coming soon")
    })

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

    //ipc.of['proxyServerIPC'].on()
});