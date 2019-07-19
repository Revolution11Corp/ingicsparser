module.exports = (function(){
    
    var mod = {};

    var LE2Dec = function(string){
        // Converts a little-endian hex string to a decimal representation
        return Buffer.from(string,"hex").readInt16LE();
    };

    var LE2BE = function(string){
        // Converts a little-endian hex string to a big-endian hex string
        return string.match(/.{1,2}/g).reverse().join("");
    };

    var getBit = function(bytes, bitNumber){
        // Gets a particular bit out of a 16-bit little-endian hex string
        return !!(Buffer.from(bytes,"hex").readInt16LE() & (1 << bitNumber));
    };

    mod.parse = function(gatewayPayload){
        var splitPayload = gatewayPayload.split(",");
        
        if(splitPayload.length>6 || splitPayload.length<5){
            throw new Error("Parsing error");
        }

        var reportType = splitPayload[0];
        if(reportType != "$GPRP" && reportType != "$SRRP")
            throw new Error("Parsing error: unknown report type");
        reportType = reportType.substring(1);

        let timestamp = 0;
        if(splitPayload.length == 6) // NTP is activated in the gateway
            timestamp = splitPayload[5];

        let rawPayload = splitPayload[4];
        //     Determine device type (iBS01/iBS01H/iBS01G or iBS01T or iBS01RG)
        // This will be done through payload length (RG has a payload length of 29 bytes)
        // and then via comparing temperature and humidity fields (HG has them both set to FFFF)
        let type;
        if(rawPayload.length == 58){
            //Payload length is 29 as each byte is two hexa characters
            type = "iBS01RG";
            if(rawPayload.substring(14,18) != "81BC")
                throw new Error("Parsing error: Beacon code doesn't match packet format");
        }else if(rawPayload.length == 44){
            if(rawPayload.substring(14,18) != "80BC")
                throw new Error("Parsing error: Beacon code doesn't match packet format");
            //T or HG
            if(rawPayload.substring(24,32) == "FFFFFFFF"){
                type = "iBS01/iBS01H/iBS01G";
            }else{
                type = "iBS01T";
            }
        }else{
            throw new Error("Parsing error: payload length doesn't match any known device");
        }

        //Type is determined, now let's extract the properties to a js object

        let payload = {};
        payload["MFGCode"] = LE2BE(rawPayload.substring(10,14));
        payload["BeaconCode"] = LE2BE(rawPayload.substring(14,18));

        if(type == "iBS01/iBS01H/iBS01G"){
            let eventByte = rawPayload.substring(22,24);
            payload = {
                ...payload,
                ...{
                    tagBatt : LE2Dec(rawPayload.substring(18,22))/100,
                    eventStatus : eventByte,
                    button: getBit(eventByte+"00", 0),
                    moving: getBit(eventByte+"00", 1),
                    hallSensor: getBit(eventByte+"00", 2),
                    fall: getBit(eventByte+"00", 3)
                }
            }
        }else if(type == "iBS01T"){
            let eventByte = rawPayload.substring(22,24);
            payload = {
                ...payload,
                ...{
                    tagBatt : LE2Dec(rawPayload.substring(18,22))/100,
                    eventStatus : eventByte,
                    button: getBit(eventByte+"00", 0),
                    moving: getBit(eventByte+"00", 1),
                    reed: getBit(eventByte+"00", 2),
                    temperature : LE2Dec(rawPayload.substring(24,28))/100,
                    humidity : LE2Dec(rawPayload.substring(28,32))
                }
            }
        }else if(type == "iBS01RG"){
            payload = {
                ...payload,
                ...{
                    tagBatt : (LE2Dec(rawPayload.substring(18,22)) & 0x0FFF)/100,
                    buttonPressed : getBit(rawPayload.substring(18,22), 13),
                    moving : getBit(rawPayload.substring(18,22), 12),
                    samples : [
                        {
                            accX: LE2Dec(rawPayload.substring(22,26)),
                            accY: LE2Dec(rawPayload.substring(26,30)),
                            accZ: LE2Dec(rawPayload.substring(30,34))
                        },
                        {
                            accX: LE2Dec(rawPayload.substring(34,38)),
                            accY: LE2Dec(rawPayload.substring(38,42)),
                            accZ: LE2Dec(rawPayload.substring(42,46))
                        },
                        {
                            accX: LE2Dec(rawPayload.substring(46,50)),
                            accY: LE2Dec(rawPayload.substring(50,54)),
                            accZ: LE2Dec(rawPayload.substring(54,58))
                        },
                    ]
                }
            }
        }else{
            // Unknown device type
            throw new Error("Parsing error: unknown device type");
        }

        return {
            reportType:reportType,
            tagId:splitPayload[1],
            gatewayId:splitPayload[2],
            rssi:splitPayload[3],
            ...(timestamp && {timestamp: timestamp}),
            rawPayload: rawPayload,
            deviceType: type,
            payload : payload
        }
        
    };

    return mod;

}());
