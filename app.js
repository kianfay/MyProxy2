var net = require('net');
var dns = require('dns');
var ipc = require('node-ipc');
var fs = require('fs');

var cacheAddress = './cache.json';
var blacklistAddress = './blacklist.json';

/* We fetch the JSON local file containing our blacklist data
** and convert it to a JS object */
var localBlacklist = null;
fs.readFile(blacklistAddress, 'utf-8', (error, data) => {
    if(error) { 
        console.error("Error importing blacklist")
    }
    listJSON = JSON.parse(data);

    // Extracts the string array of blocked URLs
    localBlacklist = listJSON.blacklistedURLArray;
})


/*  We fetch our local cache file and extract the list 
**  of url mappings to HTTP response  */
var localCache = null;
var cacheMap = null;

fs.readFile(cacheAddress, 'utf-8', (error, data) => {
    if(error) { 
        console.error("Error importing cache")
    }
    listJSON = JSON.parse(data);

    // Extracts the string array of blocked URLs, and convert it to a Map
    // so that we can easily map a URL to its cached data
    localCache = listJSON.cachedHTTPResponses;
    cacheMap = new Map();
    for(var i = 0; i < localCache.length; i++){
        cacheMap.set(localCache[i].url, localCache[i].response)
    }
})


/* We set up an IPC server for any management console to connect
** to and monitor the proxy through. By setting ipc.config.id to
** proxyServerIPC, we can connect to this IPC server from any
** instance of ManagementConsole running on the same computer
** as the proxy server */
ipc.config.id = 'proxyServerIPC';
ipc.config.retry = 1500;
ipc.config.silent = true;

ipc.serve(() => {

    // This outlines what to do when this IPC server receives a message
    // with the title 'addToBlacklist'. The callback writes the received URL
    // to the local list of blacklisted URLs, and then writes this list back to
    // the blacklist.json file
    ipc.server.on('addToBlacklist', message => {
        if(localBlacklist){

            localBlacklist.push(message)
            var objectToWriteAsJSON = {
                blacklistedURLArray: localBlacklist
            }

            fs.writeFile('./blacklist.json', JSON.stringify(objectToWriteAsJSON), () => {
                //console.log("Wrote new url to blacklist: " + message)
            })
        }
    });

    // This responds to a request for a list of the currently blacklisted URLs
    ipc.server.on('queryBlacklist', () => {
        if(localBlacklist){
            ipc.server.broadcast('BlacklistListing', localBlacklist);
        } else {
            ipc.server.broadcast('BlacklistListing', "Proxy server's blacklist remains uninitialised");
        }
    });

});
ipc.server.start();


/* Finally we create proxy server and start listening for requests, and
** on each request, we check the URL against the blacklist, and if it is not
** blacklisted, we create a socket connection to the URL */
const proxyServer = net.createServer();

// For debugging reasons
//proxyServer.maxConnections = 1;

proxyServer.on('connection', (socket) => {

/*  Define the socket connection between the proxy and a HTTPS target
**  variable already, and when not null, we know we want a
**  forwarding channel, so we can divert any messages */
    var ProxyCLientS = null;

/*  Define a function which abstracts the forwarding of a HTTP request 
**  to the webserver, and also the forwarding of the response */
    function forwardRequest(host, port, forwardData){
        
        ipc.server.broadcast('HTTPReq', "Forwarding a HTTP request to " + host);
        
        // Check cache first, and on a cache miss, we try to set up a connection
        if(cacheMap && cacheMap.has(host)){

            socket.write(cacheMap.get(host));

        } else {

            // use DNS to translate hostname to IP
            dns.lookup(host, (error, addr, fam) => {
                    
                if(error){
                    console.error("Error parsing this hostname: " + error);
                    return;
                }
                
                // create a TCP connection to the webserver's IP (using 80 for any HTTP requests)
                ProxyCLient = net.connect(port ,addr, () => {
                    //console.log("connected to webserver");
                })
                
                // Forward the request to the webserver
                ProxyCLient.write(forwardData);
                
                // When the proxy receives data from the web server, forward it
                // to the client and store in cache if a cacheMap is active
                ProxyCLient.on('data', (dataFromWebServer) => {

                    socket.write(dataFromWebServer);

                    if(cacheMap) {
                        cacheMap.set(host, dataFromWebServer);
                        localCache.push({
                            url: host,
                            response: dataFromWebServer
                        });
                        
                        var toWrite = {
                            cachedHTTPResponses: localCache
                        }

                        fs.writeFile('./cache.json', JSON.stringify(toWrite), (err) => {
                                if (err) throw err;
                        })
                    }
                }) 
            });
        }
    }

/*  Define a function which deals with incoming HTTPS requests*/
    function forwardRequestSSL(host, port){
        
        ipc.server.broadcast('ConnectReq', "Forwarding a HTTPS request to " + host);

        // use DNS to translate hostname to IP
        dns.lookup(host, (error, addr, fam) => {
                
            if(error){
                console.error("Error parsing this hostname: " + error);
                return;
            }
            
            // create a TCP connection to the webserver's IP
            ProxyCLientS = net.connect(port ,addr, () => {
                console.log("connected to webserver");

                ProxyCLientS.setKeepAlive(true)

                ProxyCLientS.on('error', (error) => {
                    console.error('Received an error at the connection between server and proxy' + error)
                });

                // Set the callback to the event where the proxy connection with the web server
                // receives data, to send the data to the client
                ProxyCLientS.on('data', (dataFromWebServer) => {
                    // console.log("Tunnelling data from server to client");
                    // console.log("forwarding this RESPONSE to whichever source requested " + host);
                    socket.write(dataFromWebServer)
                });

                // And finally, send a response to the client indicating the proxy is ready
                // to pipe data from the client to the web server
                socket.write("HTTP/1.1 200 Connection established\r\n\r\n");

            })
        });
    }

    socket.on('error', (error) => {
        console.error('Received an error at the connection between client and proxy')
    })

    // Set callback for when a request is received to forward the data,
    // or TLS data to be piped to the web server
    socket.on('data', (data) => {

        // If ProxyClientS is not null, it means we have created a
        // connection to forward HTTPS/TLS data for the client
        if(ProxyCLientS != null){
            if(ProxyCLientS.write(data)){
                // console.log("tunnel created. data sent: "+ data.slice(1,10))
            }
        }

        // Otherwise we check that it is a HTTP request. To do this, knowing
        // the first line of a HTTP request looks like 'CONNECT www.etoro.com:443 HTTP/1.1'
        // or 'GET www.etoro.com:443 HTTP/1.1' we isolate the 3rd word and check it is 'HTTP/x.x'
        
        var httpSplit = data.toString().split(' ');
        if(!/HTTP\/\d\.\d/.exec(httpSplit[2])) {
            return;
        }
        
        // Now we know it is a HTTP request, we isolate the first word in the request
        var verb = httpSplit[0];

        // and forward the requests to different ports depending on the verb
        if(verb == 'GET'){
            
            // We use regex to isolate the Host header's value
            match = /Host: (.+)\r\n.*/.exec(data);

            // If we can match the regex to find the host (which will be in the
            // match[1], representing the first group found in the match), check if
            // its on the blacklist and if so reject by sending a bad request HTTP response
            if(match){
                
                // We terminate here if the URL is found in the blacklist
                if(localBlacklist && localBlacklist.includes(match[1])){
                    return;

                } else {
                    // We send the HTTP request to be forwarded, assuming port 80
                    // as HTTP servers should run on this port
                    forwardRequest(match[1], 80, data);
                }
            }
        }
        else if(verb == 'CONNECT'){
            
            match = /Host: (.+):.+\r\n.*/.exec(data);

            if(match){
                if(localBlacklist && localBlacklist.includes(match[1])){
                    return;

                } else {

                    // We set our connection with the client to keep alive
                    // to act as a pipe to the web server. And port 443 is assumed
                    // as this is the default port for initiating HTTPS connections
                    socket.setKeepAlive(true)
                    forwardRequestSSL(match[1], 443);
                }
            }
        }
    });
});

proxyServer.listen(4000, "localhost");