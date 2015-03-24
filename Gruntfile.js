var fs = require('fs');

module.exports = function (grunt) {
  'use strict';

  require('load-grunt-tasks')(grunt);
  var _ = require('lodash');

  var karmaConfig = function(configFile, customOptions) {
    var options = { configFile: configFile, keepalive: true };
    var travisOptions = process.env.TRAVIS && { browsers: ['Firefox'], reporters: 'dots' };
    return _.extend(options, customOptions, travisOptions);
  };

  // Returns configuration for bower-install plugin
  var loadTestScopeConfigurations = function () {
    var scopes = fs.readdirSync('./test_scopes').filter(function (filename) {
      return filename[0] !== '.';
    });
    var config = {
      options : {
        color : false,
        interactive : false
      }
    };
    // Create a sub config for each test scope
    for (var idx in scopes) {
      var scope = scopes[idx];
      config['test_scopes_' + scope] = {
        options : {
          cwd : 'test_scopes/' + scope,
          production : false
        }
      };
    }
    return  config;
  };

  grunt.initConfig({
    pkg: grunt.file.readJSON('bower.json'),
    meta: {
      banner: '/*! <%= pkg.title || pkg.name %> - v<%= pkg.version %> - ' +
        '<%= grunt.template.today("yyyy-mm-dd") %>\n' +
        '<%= pkg.homepage ? "* " + pkg.homepage + "\n" : "" %>' +
        '* Copyright (c) <%= grunt.template.today("yyyy") %> <%= pkg.author.name %>;' +
        ' Licensed <%= _.pluck(pkg.licenses, "type").join(", ") %> */'
    },
    clean: {
      dist: 'dist/',
      temp: 'temp/'
    },
    watch: {
      'babel-src': {
        files: ['src/**/*.js'],
        tasks: ['concat:all', 'babel']
      },
      'coffee-test': {
        files: ['test/**/*.coffee'],
        tasks: ['coffee:test']
      },
      scripts: {
        files: ['Gruntfile.js', 'temp/**/*.js', 'test/**/*.js'],
        tasks: ['jshint', 'karma:unit']
      }
    },
    jshint: {
      all: ['Gruntfile.js', 'test/unit/*.js'],
      options: {
        eqeqeq: true,
        globals: {
          angular: true
        }
      }
    },
    coffee: {
      test: {
        options: {
          bare: true
        },
        expand: true,
        cwd: 'test/',
        src: ['unit/**/*.coffee'],
        dest: 'temp/test/',
        ext: '.js'
      }
    },
    babel: {
      options: {
          sourceMap: false
      },
      src: {
        expand: true,
        cwd: 'src/',
        src: ['**/*.js'],
        dest: 'temp/',
        ext: '.js5.js'
      },
      temp: {
        expand: true,
        cwd: 'temp/',
        src: ['*.js6.js'],
        dest: 'temp/',
        ext: '.js5.js'
      }
    },
    traceur: {
      options: {
        //experimental: true,
        blockBinding: true,
        copyRuntime: 'temp/runtime.js'
      },
      src: {
        expand: true,
        cwd: 'src/',
        src: ['**/*.js'],
        dest: 'temp/',
        ext: '.js5.js'
      },
      temp: {
        expand: true,
        cwd: 'temp/',
        src: ['*.js6.js'],
        dest: 'temp/',
        ext: '.js5.js'
      }
    },
    es6transpiler: {
      options: {
        globals: {
          'angular': true,
          'vertx': true
        }
      },
      src: {
        expand: true,
        cwd: 'src/',
        src: ['**/*.js'],
        dest: 'temp/',
        ext: '.js5.js'
      },
      temp: {
        expand: true,
        cwd: 'temp/',
        src: ['*.js6.js'],
        dest: 'temp/',
        ext: '.js5.js'
      }
    },
    umd: {
      sockjs: {
        options: {
          src: [
            'bower_components/sockjs-client/dist/sockjs.js'
          ],
          dest: 'dist/sockjs.js',
          objectToExport: 'SockJS',
          indent: 2
        }
      },
      vertxbus: {
        options: {
          src: [
            'bower_components/vertxbus.js/index.js'
          ],
          dest: 'dist/vertxbus.js',
          objectToExport: 'vertx',
          indent: 2,
          deps: {
            'default': ['SockJS'],
            amd: ['sockjs'],
            cjs: ['sockjs'],
            global: ['SockJS']
          }
        }
      },
      dist: {
        options: {
          src: [
            'temp/all.js5.js'
          ],
          dest: 'dist/angular-vertxbus.js',
          objectToExport: '"knalli.angular-vertxbus"',
          indent: 2,
          deps: {
            'default': ['angular', 'vertx'],
            amd: ['angular', 'vertxbus'],
            cjs: ['angular', 'vertxbus'],
            global: ['angular', 'vertx']
          }
        }
      }
    },
    concat: {
      all: {
        src: [
          'src/vertxbus-module.js',
          'src/vertxbus-wrapper.js',
          'src/vertxbus-service.js'
        ],
        dest: 'temp/all.js6.js'
      },
      license: {
        options: {
          banner: '/*! <%= pkg.title || pkg.name %> - v<%= pkg.version %> - ' +
            '<%= grunt.template.today("yyyy-mm-dd") %>\n' +
            '<%= pkg.homepage ? "* " + pkg.homepage + "\\n" : "" %>' +
            '* Copyright (c) <%= grunt.template.today("yyyy") %> <%= pkg.author.name %>;' +
            ' Licensed <%= _.pluck(pkg.licenses, "type").join(", ") %> */\n'
        },
        src: 'dist/angular-vertxbus.js',
        dest: 'dist/angular-vertxbus.js'
      }
    },
    uglify: {
      options: {
        preserveComments: 'some'
      },
      src: {
        files: {
          'dist/angular-vertxbus.min.js': 'dist/angular-vertxbus.js'
        }
      }
    },
    karma: {
      unit: {
        options: karmaConfig('karma.conf.js', {
          singleRun: true
        })
      },
      headless: {
        options: karmaConfig('karma.conf.js', {
          singleRun: true,
          browsers: ['PhantomJS']
        })
      },
      server: {
        options: karmaConfig('karma.conf.js', {
          singleRun: false
        })
      }
    },
    changelog: {
      options: {
        dest: 'CHANGELOG.md'
      }
    },
    ngAnnotate: {
      options: {
        singleQuotes: true
      },
      temp: {
        src: 'temp/*.js5.js',
        dest: 'temp/*.js5.js'
      }
    },

    'bower-install-simple': loadTestScopeConfigurations()

  });

  //grunt.registerTask('_tes6-to-es5_', ['babel']);
  //grunt.registerTask('_tes6-to-es5_', ['traceur']); // TODO requires runtime
  grunt.registerTask('_tes6-to-es5_', ['es6transpiler']);

  grunt.registerTask('default', ['clean:temp', 'concat:all', 'coffee', '_tes6-to-es5_', 'jshint', 'karma:unit']);
  grunt.registerTask('test', ['concat:all', 'coffee', '_tes6-to-es5_', 'jshint', 'karma:unit']);
  grunt.registerTask('install-test', ['bower-install-simple']);
  grunt.registerTask('test-server', ['karma:server']);
  grunt.registerTask('build', ['clean', 'concat:all', 'coffee', '_tes6-to-es5_', 'jshint', 'karma:unit', 'ngAnnotate', 'umd', 'concat:license', 'uglify']);
  grunt.registerTask('release', ['changelog', 'build']);
};
