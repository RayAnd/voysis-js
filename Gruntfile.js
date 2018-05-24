module.exports = function (grunt) {

    var pkg = grunt.file.readJSON('package.json');
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        copy: {
            main: {
                options: {
                    process: function (content, srcpath) {
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

    grunt.loadNpmTasks('grunt-contrib-uglify-es');
    grunt.loadNpmTasks('grunt-contrib-copy');

    grunt.registerTask('dist', ['copy', 'uglify']);
    grunt.registerTask('default', ['dist']);

};
