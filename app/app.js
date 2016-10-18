/*

 PayPal History Repair Tool
 ©2016 CasperTech Ltd (UK)
 https://github.com/TomMettam/PayPalHistoryRepair

 This work is licensed under a Creative Commons Attribution-ShareAlike 4.0 International License.

 https://creativecommons.org/licenses/by-sa/4.0/


 */
angular.module('craypal', ['ngPapaParse', 'angularMoment', 'ngCsv']);

angular.module('craypal').controller('main', function($scope, Papa, $timeout)
{
    $scope.fileReadProgressValue = 0;
    $scope.gotFile = false;
    $scope.reading = false;
    $scope.processing = false;
    $scope.processed = false;
    $scope.file = {
        data: null
    };

    $scope.tzData = window.tzData;

    $scope.fileStart = function()
    {
        $scope.gotFile = true;
        $scope.reading = true;
        $scope.$digest();
    };
    $scope.fileReadError = function($error)
    {
        $scope.reading = false;
        $scope.gotFile = false;
        $scope.$digest();
        alert('Error reading file');
    };
    $scope.fileReadProgress = function(total, loaded)
    {
        $scope.fileReadProgressValue = (loaded / total)*1000;
        $scope.$digest();
    };
    $scope.fileReadComplete = function(result)
    {
        $scope.reading = false;

        //First of all, preprocess
        var r = result.indexOf("\r");
        var n = result.indexOf("\n");
        var delimiter = "\n";
        if (r!==-1 && r<n)
        {
            delimiter="\r\n";
            var i = delimiter.length;
            n = r;
        }
        var header = result.substr(0, n-1);
        var body = result.substr(n);
        var fields = header.split(',');
        var newFields = [];
        for(var x = 0; x < fields.length; x++)
        {
            var field = fields[x].trim();
            newFields.push(field);
        }

        body = body.split(delimiter);
        var newBody = [];
        for(x = 0; x < body.length; x++)
        {
            body[x] = body[x].trim();
            if(body[x].length>0)
            {
                newBody.push(body[x]);
            }
        }
        body = delimiter+newBody.join(delimiter);

        result = newFields.join(',')+body;
        result = Papa.parse(result, {header: true, skipEmptylines: true});
        if (result.errors.length>0)
        {
            $scope.gotFile = false;
            $scope.$digest();
            alert('Sorry, we were unable to parse that file. Are you sure it\'s a valid PayPal CSV?');
            return;
        }
        if (result.data.length<1)
        {
            $scope.gotFile = false;
            $scope.$digest();
            alert('That file contained no data!');
            return;
        }
        var testRow = result.data[0];

        //Date, Time, Time Zone, Name, Type, Status, Currency, Amount, Receipt ID, Balance,
        //Currency, Fee, Gross, Name, Type, Date, Time, Status, Transaction ID, Time Zone, Balance

        //Amount -> Gross, Receipt ID -> TransactionID
        if (!(testRow['Currency']!==undefined && testRow['Fee']!==undefined && testRow['Gross']!==undefined && testRow['Name']!==undefined && testRow['Type']!==undefined && testRow['Date']!==undefined && testRow['Time']!==undefined && testRow['Status']!==undefined && testRow['Transaction ID']!==undefined && testRow['Time Zone']!==undefined && testRow['Balance']!==undefined))
        {
            if (!(testRow['Date']!==undefined && testRow['Time']!==undefined && testRow['Time Zone']!==undefined && testRow['Name']!==undefined && testRow['Type']!==undefined && testRow['Status']!==undefined && testRow['Currency']!==undefined && testRow['Amount']!==undefined && testRow['Receipt ID']!==undefined && testRow['Balance']!==undefined))
            {
                $scope.gotFile = false;
                $scope.$digest();
                alert('Required fields were missing - this doesn\'t appear to be a valid CSV file');
                return;
            }
        }

        //Okay, now let's gather the information that we need
        $scope.timeZones = {};
        $scope.currencies = {};
        result.data.forEach(function(data)
        {
            //Fudge for personal PayPal accounts which don't have all the fields we want
            if (data['Amount']!==undefined && data['Gross']===undefined)
            {
                data['Gross'] = data['Amount'];
                delete data['Amount'];
            }
            if (data['Receipt ID']!==undefined && data['Transaction ID']===undefined)
            {
                data['Transaction ID'] = data['Receipt ID'];
                delete data['Receipt ID'];
            }
            if (data['Fee']===undefined)
            {
                data['Fee'] = "0.00";
            }
            var tz = data['Time Zone'];
            if (!$scope.timeZones[tz])
            {
                $scope.timeZones[tz] = {timezone: tz};
            }
            var currency = data['Currency'];
            if (!$scope.currencies[currency])
            {
                $scope.currencies[currency] = {};
            }

            var separator = '-';
            if (data['Date'].indexOf(' ')!==-1)
            {
                separator = " ";
            }
            if (data['Date'].indexOf('.')!==-1)
            {
                separator = ".";
            }
            if (data['Date'].indexOf('/')!==-1)
            {
                separator = "/";
            }
            if (data['Date'].indexOf('\\')!==-1)
            {
                separator = "\\";
            }
            if (data['Date'].indexOf('-')!==-1)
            {
                separator = "-";
            }
            function escapeRegExp(str) {
                return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
            }
            var re = new RegExp(escapeRegExp(separator),"g");
            var d = data['Date'].replace(re, '-').split("-");
            if (d.length>2)
            {
                if (parseInt(d[0]).length==4)
                {
                    $scope.dateFormat = 'YYYY'+separator+'MM'+separator+'DD';
                }
                else
                {
                    if (parseInt(d[0])>12)
                    {
                        $scope.dateFormat = 'DD'+separator+'MM'+separator+'YY';
                        if (d[2].length>2)
                        {
                            $scope.dateFormat+='YY';
                        }
                    }
                    if (parseInt(d[1])>12)
                    {
                        $scope.dateFormat = 'MM'+separator+'DD'+separator+'YY';
                        if (d[2].length>2)
                        {
                            $scope.dateFormat+='YY';
                        }
                    }
                }
            }
        });
        $scope.data = result.data;
        $scope.$digest();
    };
    $scope.orderEntry = function(e)
    {
        var entry = [];
        entry.push(e.date);
        entry.push(e.time);
        entry.push(e.dt);
        entry.push(e.description);
        entry.push(e.amount);
        entry.push(e.balance);
        return entry;
    };
    $scope.process = function()
    {
        $scope.processingData = true;
        $timeout(function()
        {
            var fault = false;
            Object.keys($scope.timeZones).forEach(function(tz)
            {
                if (!fault && !$scope.timeZones[tz].region)
                {
                    alert('Please select the region for timezone: '+tz);
                    fault = true;
                }
            });
            if (fault)
            {
                $scope.processingData = false;
                return;
            }

            $scope.bytx = {};

            var newArray = [];
            $scope.data.forEach(function(data)
            {
                var timeZone = data['Time Zone'];
                if ($scope.timeZones[timeZone])
                {
                    timeZone = $scope.timeZones[timeZone].region;
                }

                var dt = moment.tz(data['Date']+" "+data['Time'], $scope.dateFormat+" HH:mm:ss", timeZone);
                var entry = {
                    dt: dt,
                    currency: data['Currency'],
                    status: data['Status'],
                    description: data['Name']+ ' - '+data['Type'] + ((data['Transaction ID'].length>0)?' (' + data['Transaction ID'] + ')':''),
                    amount: data['Gross'],
                    fee: data['Fee'],
                    balance: data['Balance'],
                    type: data['Type'],
                    name: data['Name'],
                    ref: data['Reference Txn ID'],
                    txid: data['Transaction ID'],
                    timezone: timeZone
                };
                newArray.push(entry);
                $scope.bytx[data['Transaction ID']] = entry;
            });

            //Obtain the starting balance
            Object.keys($scope.currencies).forEach(function(currency)
            {
                $scope.currencies[currency].data = [];
                $scope.currencies[currency].first = true;
                for(var x = 0; x < newArray.length; x++)
                {
                    if (newArray[x].currency == currency)
                    {
                        var bl = parseFloat(newArray[x].balance);
                        if ($scope.currencies[currency].first)
                        {
                            //Get final balance (balance shown in the very last PayPal entry)
                            $scope.currencies[currency].first = false;
                            $scope.currencies[currency].balance = bl;
                            break;
                        }
                    }
                }
            });

            //Sort entries by date, descending order
            newArray.sort(function(a, b)
            {
                return moment.utc(b.dt).diff(moment.utc(a.dt));
            });
            //We want to product a separate sheet for each currency
            $scope.fixedBalance = 0;
            $scope.fixedDescription = 0;
            $scope.fixedFee = 0;

            Object.keys($scope.currencies).forEach(function(currency)
            {
                //Now, iterate over each transaction and fix the balance
                for(var x = 0; x < newArray.length; x++)
                {
                    if (newArray[x].currency == currency)
                    {
                        if (typeof newArray[x].amount=='string') newArray[x].amount = parseFloat(newArray[x].amount.replace(/,/g,''));
                        if (typeof newArray[x].balance=='string') newArray[x].balance = parseFloat(newArray[x].balance.replace(/,/g,''));
                        if (typeof newArray[x].fee=='string') newArray[x].fee = parseFloat(newArray[x].fee.replace(/,/g,''));


                        var bl = newArray[x].balance;

                        if (bl != $scope.currencies[currency].balance)
                        {
                            console.log("Adjusted balance for currency "+currency+" from line " + x + " from " + bl + " to " + $scope.currencies[currency].balance);
                            $scope.fixedBalance++;
                        }
                        newArray[x].balance = $scope.currencies[currency].balance.toFixed(2);
                        $scope.currencies[currency].balance = $scope.currencies[currency].balance - (newArray[x]['amount'] + newArray[x]['fee']);

                        //Check for unhelpful descriptions
                        if (newArray[x].type=='Currency Conversion' && newArray[x].name.substr(0,3)=='To ')
                        {
                            //Found a currency conversion with a potentially unhelpful description
                            var ref = newArray[x].ref;
                            if (ref!==undefined)
                            {
                                //Search all records for this transaction ID
                                if ($scope.bytx[ref] && newArray[x].currency !== $scope.bytx[ref].currency)
                                {
                                    if (typeof $scope.bytx[ref].fee == 'string') $scope.bytx[ref].fee = parseFloat($scope.bytx[ref].fee.replace(/,/g, ''));
                                    if (typeof $scope.bytx[ref].amount == 'string') $scope.bytx[ref].amount = parseFloat($scope.bytx[ref].amount.replace(/,/g, ''));
                                    newArray[x].description = $scope.bytx[ref].amount.toFixed(2) + " " + $scope.bytx[ref].currency + " - " + $scope.bytx[ref].description;
                                    $scope.fixedDescription++;

                                    //If this foreign-currency transaction involves a fee, things get a little complicated. *bangs head*
                                    //Also, if you're reading this, check out Tresorit. http://www.tresorit.com
                                    //Oh, on more thing. Pandas are cool.
                                    var fee    = $scope.bytx[ref].fee;
                                    var amount = $scope.bytx[ref].amount;
                                    if (fee !== 0.0)
                                    {
                                        //Fee located in foreign transaction. Balls. This should do it, but may be 1p out due to rounding? Shouldn't cause a hassle.
                                        var factor      = fee / (fee + amount);
                                        newArray[x].fee = Math.round((newArray[x].amount * 100) * factor) / 100;
                                        newArray[x].amount -= newArray[x].fee;
                                    }
                                }
                            }
                            else
                            {
                                //Fudge for personal account CSVs - no 'Reference' column, so just search for a payment with a matching time
                                //This isn't great because it's not an exact science, for safety purposes we'll make sure we only match one
                                var matches = 0;
                                var found = 0;
                                for(var y = 0; y < newArray.length; y++)
                                {
                                    if (newArray[x].dt.isSame(newArray[y].dt))
                                    {
                                        if (newArray[y].type.indexOf('Payment Sent')!==-1)
                                        {
                                            matches++;
                                            found = y;
                                        }
                                    }
                                }
                                if (matches==1)
                                {
                                    if (typeof newArray[found].fee == 'string') newArray[found].fee = parseFloat(newArray[found].fee.replace(/,/g, ''));
                                    if (typeof newArray[found].amount == 'string') newArray[found].amount = parseFloat(newArray[found].amount.replace(/,/g, ''));
                                    newArray[x].description = newArray[found].amount.toFixed(2) + " " + newArray[found].currency + " - " + newArray[found].description;
                                    $scope.fixedDescription++;

                                    //Personal account CSVs don't have a fee column, so our work ends here.
                                }
                            }
                        }

                        //Clone the entry and remove the values we don't need in the CSV
                        var entry = {};
                        Object.keys(newArray[x]).forEach(function(k)
                        {
                            if (k!=='type' && k!=='name' && k!=='ref' && k!=='txid')
                            {
                                entry[k] = newArray[x][k];
                            }
                        });

                        entry.date = entry.dt.format($scope.dateFormat);
                        entry.time = entry.dt.format("HH:mm:ss");

                        //Check for fee payment
                        var fee = entry.fee;
                        if (fee!=0)
                        {
                            var feeEntry = {};
                            Object.keys(entry).forEach(function(k)
                            {
                                if (k!=='type' && k!=='name' && k!=='ref' && k!=='txid')
                                {
                                    feeEntry[k] = entry[k];
                                }
                            });

                            feeEntry.description = 'PayPal Fee';
                            feeEntry.amount = fee;
                            delete feeEntry.fee;
                            delete entry.fee;
                            entry.balance -= fee;
                            feeEntry.balance = entry.balance + fee;
                            $scope.currencies[currency].data.push($scope.orderEntry(feeEntry));
                            $scope.currencies[currency].data.push($scope.orderEntry(entry));

                            $scope.fixedFee++;
                        }
                        else
                        {
                            //No fee, just carry on
                            delete entry.fee;
                            $scope.currencies[currency].data.push($scope.orderEntry(entry));
                        }
                    }
                }
            });

            $scope.processingData = false;
            $scope.processed = true;
        },1);
    };
    $scope.getKeys = function(obj)
    {
        return [
            "Date",
            "Time",
            "RFC Date",
            "Description",
            "Amount",
            "Balance"
        ];
    };
    $scope.goBack = function()
    {
        $scope.currencies = {};
        $scope.data = [];
        $scope.gotFile = false;
        $scope.reading = false;
        $scope.processing = false;
        $scope.processed = false;
    }

});