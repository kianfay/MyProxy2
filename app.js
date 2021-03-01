var net = require('net');
var dns = require('dns');
var url = require('url');

// Create proxy server and start listening for requests
const proxyServer = net.createServer();

// For debugging reasons
//proxyServer.maxConnections = 1;

proxyServer.on('connection', (socket) => {

    var TLSActive = false;
    var TLSCount = 0;
    var ProxyCLientS = null;

/*  Define a function which abstracts the forwarding of a request to the webserver, and
**  also the forwarding of the response */
    function forwardRequest(host, port, forwardData, HTTPS){
        
        (HTTPS == true) ? 
        console.log("Establishing TCP connection with: " + host + " at port " + port)
        :
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

                ProxyCLient.on('error', (error) => {
                    console.log('Received an error at the connection between server and proxy')
                    console.log(error)
                });

                if(HTTPS == true) {

                    TLSActive = true;

                    ProxyCLient.setKeepAlive(true)

                    ProxyCLient.on('data', (dataFromWebServer) => {
                        console.log("Tunelling data from server to client");
                        console.log("forwarding this RESPONSE to whichever source requested " + host);
                        socket.write(dataFromWebServer)
                    });

                    socket.write("HTTP/1.1 200 Connection established\r\n\r\n");

                } else {

                    ProxyCLient.on('data', (dataFromWebServer) => {
                        console.log("Recieved this data as a response: " + dataFromWebServer);
                        console.log("forwarding this RESPONSE to whichever source requested " + host);
                        socket.write(dataFromWebServer)
                    }) 

                    ProxyCLient.write(forwardData);
                }
            });
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

                ProxyCLientS.setKeepAlive(true)

                ProxyCLientS.on('error', (error) => {
                    console.log('Received an error at the connection between server and proxy')
                    console.log(error)
                });

                ProxyCLientS.on('data', (dataFromWebServer) => {
                    console.log("Tunelling data from server to client");
                    console.log("forwarding this RESPONSE to whichever source requested " + host);
                    socket.write(dataFromWebServer)
                });

                socket.write("HTTP/1.1 200 Connection established\r\n\r\n");

            })
        });
    }

    socket.on('error', (error) => {
        console.log('Received an error at the connection between client and proxy')
    })

    /* 
    Set callback for when a request is received first check if a TLS tunnel is in opperation, 
    and then if not, we assume it is a HTTP request, so we extract the verb and respond appropriately.
    */ 
   socket.on('data', (data) => {

        if(TLSActive == true){
            if(ProxyCLient.write(data)){
                console.log("tunnel created. data sent [" + TLSCount + "]: "+ data.slice(1,10));
                TLSCount++;
                return;
            }
        }

        // Isolate the HTTP verb at [0]
        var httpSplit = data.toString().split(' ');
        var verb = httpSplit[0];

        /* 
        forward the requests to different ports depending on the verb, and we assume 443 for HTTPS
        and 80 for HTTP. 
        */
        if(verb == 'GET'){
            console.log("\nRedirecting for a GET")
            match = /Host: (.+)\r\n.*/.exec(data);
            if(match){
                console.log("Host is: " + match[1]);
                forwardRequest(match[1], 80, data, false);
            }
        }
        else if(verb == 'CONNECT'){
            console.log("\nRedirecting for a CONNECT")
            match = /Host: (.+):.+\r\n.*/.exec(data);
            if(match){
                console.log("Host is: " + match[1]);
                socket.setKeepAlive(true)
                forwardRequest(match[1], 443, data, true);
            }
        }

        console.log('\n');
    });
});

proxyServer.listen(3000, "localhost");

