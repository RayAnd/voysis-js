module.exports = function (grunt) {
    'use strict';

    var pkg = grunt.file.readJSON('package.json');
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        eslint: {
            all: [
                'Gruntfile.js',
                'src/js/*.js'
            ],
            options: {
                configFile: '.eslintrc'
            }
        },
        jasmine: {
            src: 'src/js/*.js',
            options: {
                specs: 'spec/*.js',
                keepRunner: false
            }
        },
        copy: {
            main: {
                options: {
                    process: function (content) {
                        return content.replace(/\${LIBRARY_VERSION}/g, pkg.version);
                    }
                },
                files: [
                    {
                        nonull: true,
                        src: 'src/js/voysis.js',
                        dest: 'build/voysis.js',
                    },
                    {
                        nonull: true,
                        src: 'src/js/voysis.js',
                        dest: 'build/voysis-<%= pkg.version %>.js',
                    }
                ]
            }
        },
        uglify: {
            options: {
                banner: '/* Copyright (c) <%= grunt.template.today("yyyy") %> Voysis | Released under the MIT License */\n'
            },
            main: {
                files: {
                    'build/voysis.min.js': 'build/voysis.js',
                    'build/voysis-<%= pkg.version %>.min.js': 'build/voysis.js'
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-jasmine');
    grunt.loadNpmTasks('grunt-contrib-uglify-es');
    grunt.loadNpmTasks('grunt-eslint');

    grunt.registerTask('test', ['jasmine']);
    grunt.registerTask('dist', ['copy', 'uglify']);
    grunt.registerTask('default', ['test', 'eslint', 'dist']);

};
