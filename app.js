/* 
    LEFT OFF AT: websocket to webserver is not actually connected

 */
var net = require('net');
var dns = require('dns');
var tls = require('tls');

// Create proxy server and start listening for requests
const proxyServer = net.createServer();

// For debugging reasons
//proxyServer.maxConnections = 1;

proxyServer.on('connection', (socket) => {
    
    /* proxyServer.close(() =>{
        console.log("closing server for debugging reasons")
    }) */

/*  Set encoding so we can deal with incloming HTTP requests as strings, 
**  even if just for debugging */
    socket.setEncoding('utf8');

    //console.log("readystate: " + socket.readyState);
    //proxyServer.close();

    var ProxyCLientS = null;

/*  Define a function which abstracts the forwarding of a request to the webserver, and
**  also the forwarding of the response */
    function forwardRequest(host, port, forwardData){
        
        console.log("Forwarding data to: " + host + " at port " + port);
        
        // use DNS to translate hostname to IP
        dns.lookup(host, (error, addr, fam) => {
                
            if(error){
                console.log("Error parsing this hostname: " + error);
                return;
            }
            
            console.log("Parsed URL ( " + host + " ) translated to IP"  + fam + ": " + addr);

            // create a TCP connection to the webserver's IP (using 80 for any HTTP requests)
            ProxyCLient = net.connect(port ,addr, () => {
                console.log("connected to webserver");
                console.log("readystate: " + ProxyCLient.readyState);


                ProxyCLient.on('data', (dataFromWebServer) => {
                    //console.log("Recieved this data as a response: " + dataFromWebServer);
                    console.log("forwarding this RESPONSE to whichever source requested " + host);
                    socket.write(dataFromWebServer)
                }) 

                ProxyCLient.write(forwardData);
            })

            //ProxyCLient.setEncoding('utf-8');
        });
    }

    function forwardRequestSSL(host, port, forwardData){
        
        console.log("Establishing TCP connection with: " + host + " at port " + port);
        
        // use DNS to translate hostname to IP
        dns.lookup(host, (error, addr, fam) => {
                
            if(error){
                console.log("Error parsing this hostname: " + error);
                return;
            }
            
            console.log("Parsed URL ( " + host + " ) translated to IP"  + fam + ": " + addr);

            // create a TCP connection to the webserver's IP (using 80 for any HTTP requests)
            ProxyCLientS = net.connect(port ,addr, () => {
                console.log("connected to webserver");

                SSLSocket = new tls.TLSSocket({socket: socket, host: host }, () => {
                    socket.write("HTTP/1.1 200 Connection established\r\n\r\n");
                    console.log("Upgraded to SSL, state " + SSLSocket.readyState)
                });

                SSLSocket.on('data', (dataFromClient) => {
                    console.log("Tunelling data from client to server");
                    console.log("readystate: " + socket.readyState);
                    console.log("Recieved data for tunneling, will send to webserver on socket which is currently: " + ProxyCLientS.readyState)
                    ProxyCLientS.write(dataFromClient)
                });

                ProxyCLientS.on('error', (error) => {
                    console.log('Received an error at the connection between client and proxy')
                    console.log(error)
                });

                ProxyCLientS.on('data', (dataFromWebServer) => {
                    console.log("Tunelling data from server back to client");
                    console.log("readystate: " + socket.readyState);
                    console.log("forwarding this RESPONSE to whichever source requested " + host);
                    socket.write(dataFromWebServer)
                });


                /* socket.on('data', (data) => {
                    console.log("Tunelling data from client to server")
                    ProxyCLientS.write(data);
                }) */
            })

        });
    }

    socket.on('error', (error) => {
        console.log('Received an error at the connection between client and proxy')
    })

    // Set callback for when a request is received to forward the data
    socket.on('data', (data) => {
        if(ProxyCLientS != null){
            console.log("Recieved data for tunneling, will send to proxy server which is currently: " + ProxyCLientS.readyState)
            console.log("trying to create tunnel")
            if(ProxyCLientS.write(data)){
                console.log("tunnel created. data sent: "+ data.slice(1,10))
            }
            return;
        }

        //** Debugging **//
        //console.log("Verb: " + verb);
        //console.log("Destination: " + destination);
        console.log('\n');
        //console.log(data);

        // Isolate the HTTP verb at [0]
        var httpSplit = data.split(' ');
        var verb = httpSplit[0];
        //console.log(verb);

        // forward the requests to different ports depending on the verb
        if(verb == 'GET'){
            console.log("\nRedirecting for a GET")
            match = /Host: (.+)\r\n.*/.exec(data);
            if(match){
                console.log("Host is: " + match[1]);
                forwardRequest(match[1], 80, data);
            }
        }
        else if(verb == 'CONNECT'){
            console.log("\nRedirecting for a CONNECT")
            match = /Host: (.+):.+\r\n.*/.exec(data);
            if(match){
                console.log("Host is: " + match[1]);
                socket.setKeepAlive(true)
                forwardRequestSSL(match[1], 443, data);
            }
        }
        
        console.log('\n');

/* 
        // extract the host (note, in http://example.org, the example.org is the host. If we 
        // pass the sntire destination to dns.lookup it won't work, we must pass the host)
        const destURL = new URL(destination);

        // Only lookup hostname if we have a non empty string for it
        var passHostname = destURL.hostname;
        if(passHostname == "") {
            if( (match = destination.match(/www(\.[a-zA-Z]+)+/)) != null){
                passHostname = match[0];
            }
        }


        if(passHostname != "") {
            // use DNS to translate hostname to IP
            dns.lookup(destURL.hostname, (error, addr, fam) => {
                
                if(error){
                    console.log("Error parsing this hostname: " + destURL.hostname);
                    return;
                }
                
                console.log("Parsed URL translated to IP"  + fam + ": " + addr);

                // create a TCP connection to the webserver's IP (using 80 for any HTTP requests)
                ProxyCLient = net.connect(80 ,addr, () => {
                    console.log("connected to webserver");
                })
                ProxyCLient.write(data);

                ProxyCLient.on('data', (dataFromWebServer) => {
                    socket.write(dataFromWebServer)
                })
            });
        }

        // Log the parsed user name (may be empty if no valid one was found)
        console.log("Destination Hostname: " + passHostname); */

        
    });
});

proxyServer.listen(3000, "localhost");

