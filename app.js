var net = require('net');
var dns = require('dns');
var ipc = require('node-ipc');
var fs = require('fs')

var localBlacklist = null;

fs.readFile('./blacklist.json', 'utf-8', (error, data) => {
    if(error) { 
        console.err("Error importing blacklist")
    }
    listJSON = JSON.parse(data);

    // Extracts the string array of blocked URLs
    localBlacklist = listJSON.blacklistedURLArray;
    
    console.log("Blocked URLs: " + localBlacklist.join(', '));
})

ipc.config.id = 'proxyServerIPC';
ipc.config.retry = 1500;
ipc.config.silent = false;

ipc.serve(() => {

    ipc.server.on('addToBlacklist', message => {
        if(localBlacklist){
            console.log("Adding " + message + " to the blacklist");

            localBlacklist.push(message)
            var objectToWriteAsJSON = {
                blacklistedURLArray: localBlacklist
            }

            fs.writeFile('./blacklist.json', JSON.stringify(objectToWriteAsJSON), () => {
                console.log("Wrote new url to blacklist: " + message)
            })
        }
    });

    ipc.server.on('queryBlacklist', message => {
        if(localBlacklist){
            ipc.server.broadcast('BlacklistListing', localBlacklist);
        } else {
            ipc.server.broadcast('BlacklistListing', "Proxy server's blacklist remains uninitialised");
        }
    });

});
ipc.server.start();

// Create proxy server and start listening for requests
const proxyServer = net.createServer();

// For debugging reasons
//proxyServer.maxConnections = 1;

proxyServer.on('connection', (socket) => {


    // Read the blacklist.json file from the local directory


/*  Define this variable already, and when not null, we know we want a TLS channel, so
**  we can divert any messages */
    var ProxyCLientS = null;

/*  Define a function which abstracts the forwarding of a request to the webserver, and
**  also the forwarding of the response */
    function forwardRequest(host, port, forwardData){
        
        // console.log("Forwarding data to: " + host + " at port " + port);
        ipc.server.broadcast('HTTPReq', "Forwarding a HTTP request to " + host);
        
        // use DNS to translate hostname to IP
        dns.lookup(host, (error, addr, fam) => {
                
            if(error){
                console.log("Error parsing this hostname: " + error);
                return;
            }
            
            // console.log("Parsed URL ( " + host + " ) translated to IP"  + fam + ": " + addr);

            // create a TCP connection to the webserver's IP (using 80 for any HTTP requests)
            ProxyCLient = net.connect(port ,addr, () => {
                console.log("connected to webserver");
            })

            //ProxyCLient.setEncoding('utf-8');
            
            ProxyCLient.write(forwardData);
              
            ProxyCLient.on('data', (dataFromWebServer) => {
                // console.log("Recieved this data as a response: " + dataFromWebServer);
                // console.log("forwarding this RESPONSE to whichever source requested " + host);
                socket.write(dataFromWebServer)
            }) 
        });
    }

    function forwardRequestSSL(host, port){
        
        // console.log("Establishing TCP connection with: " + host + " at port " + port);
        ipc.server.broadcast('ConnectReq', "Forwarding a HTTPS request to " + host);

        // use DNS to translate hostname to IP
        dns.lookup(host, (error, addr, fam) => {
                
            if(error){
                console.log("Error parsing this hostname: " + error);
                return;
            }
            
            // console.log("Parsed URL ( " + host + " ) translated to IP"  + fam + ": " + addr);

            // create a TCP connection to the webserver's IP (using 80 for any HTTP requests)
            ProxyCLientS = net.connect(port ,addr, () => {
                console.log("connected to webserver");

                ProxyCLientS.setKeepAlive(true)

                ProxyCLientS.on('error', (error) => {
                    console.log('Received an error at the connection between server and proxy')
                    console.log(error)
                });

                ProxyCLientS.on('data', (dataFromWebServer) => {
                    // console.log("Tunelling data from server to client");
                    // console.log("forwarding this RESPONSE to whichever source requested " + host);
                    socket.write(dataFromWebServer)
                });

                socket.write("HTTP/1.1 200 Connection established\r\n\r\n");

            })
        });
    }

    socket.on('error', (error) => {
        console.log('Received an error at the connection between client and proxy')
    })

    // Set callback for when a request is received to forward the data
    socket.on('data', (data) => {

        if(ProxyCLientS != null){
            // console.log("trying to create tunnel")
            if(ProxyCLientS.write(data)){
                // console.log("tunnel created. data sent: "+ data.slice(1,10))
            }
        }

        // console.log('\n');
        // console.log(data);

        // Isolate the HTTP verb at [0]
        var httpSplit = data.toString().split(' ');
        var verb = httpSplit[0];
        //console.log(verb);

        // forward the requests to different ports depending on the verb
        if(verb == 'GET'){
            // console.log("\nRedirecting for a GET")
            match = /Host: (.+)\r\n.*/.exec(data);

            // If we can match the regex to find the host (which will be in the
            // match[1], representing the first group found in the match), check if
            // its on the blacklist and if so reject by sending a bad request HTTP response
            if(match){
                if(localBlacklist && localBlacklist.includes(match[1])){
                    console.log("Blocking access to: " + match[1]);
                    return;
                } else {
                    // console.log("Host is: " + match[1]);
                    forwardRequest(match[1], 80, data);
                }
            }
        }
        else if(verb == 'CONNECT'){
            // console.log("\nRedirecting for a CONNECT")
            match = /Host: (.+):.+\r\n.*/.exec(data);

            if(match){
                if(localBlacklist && localBlacklist.includes(match[1])){
                    console.log("Blocking access to: " + match[1]);
                    return;
                } else {
                    // console.log("Host is: " + match[1]);
                    socket.setKeepAlive(true)
                    forwardRequestSSL(match[1], 443);
                }
            }
        }
    });
});

proxyServer.listen(3000, "localhost");