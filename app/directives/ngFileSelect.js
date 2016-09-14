angular.module('craypal').directive('ngFileSelect', function ($window, $timeout) {
    return {
        restrict: 'A',
        link: function (scope, el, attr) {
            var fileReader = new $window.FileReader();

            fileReader.onload = function () {
                if ('fileLoaded' in attr) {
                    scope.$eval(attr['fileLoaded'], {'$data': fileReader.result});
                }
            };

            fileReader.onprogress = function (event) {
                if ('fileProgress' in attr) {
                    scope.$eval(attr['fileProgress'], {'$total': event.total, '$loaded': event.loaded});
                }
            };

            fileReader.onerror = function () {
                if ('fileError' in attr) {
                    scope.$eval(attr['fileError'], {'$error': fileReader.error});
                }
            };

            var fileType = attr['ngFileSelect'];

            el.bind('change', function (e) {
                var fileName = e.target.files[0];

                if ('fileStart' in attr) {
                    scope.$eval(attr['fileStart']);
                }
                $timeout(function()
                {
                    if (fileType === '' || fileType === 'text') {
                        fileReader.readAsText(fileName);
                    } else if (fileType === 'data') {
                        fileReader.readAsDataURL(fileName);
                    }
                },1);
            });
        }
    };
});