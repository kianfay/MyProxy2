var net = require('net');
var dns = require('dns');
var url = require('url');

// Create proxy server and start listening for requests
const proxyServer = net.createServer();

proxyServer.on('connection', (socket) => {

/*  Set encoding so we can deal with incloming HTTP requests as strings, 
**  even if just for debugging */
    socket.setEncoding('utf8');

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
            
            console.log("Parsed URL translated to IP"  + fam + ": " + addr);

            // create a TCP connection to the webserver's IP (using 80 for any HTTP requests)
            ProxyCLient = net.connect(port ,addr, () => {
                console.log("connected to webserver");
            })

            //ProxyCLient.setEncoding('utf-8');
            
            ProxyCLient.write(forwardData);
              
            ProxyCLient.on('data', (dataFromWebServer) => {
                socket.write(dataFromWebServer)
            }) 
        });
    }


    // Set callback for when a request is received to forward the data
    socket.on('data', (data) => {

        //** Debugging **//
        //console.log("Verb: " + verb);
        //console.log("Destination: " + destination);
        console.log('\n');
        console.log(data);

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
                forwardRequest(match[1], 443, data);
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

