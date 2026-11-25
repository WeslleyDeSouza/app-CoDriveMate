require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'CodrivemateVoiceNative'
  s.version = package['version']
  s.summary = package['description']
  s.license = { :type => 'Proprietary', :text => 'Private' }
  s.homepage = 'https://codrivemate.ch'
  s.author = 'CoDriveMate'
  s.source = { :path => '.' }
  s.source_files = 'ios/Sources/**/*.swift'
  s.ios.deployment_target = '15.0'
  s.swift_version = '5.9'
  s.frameworks = 'AVFoundation', 'Speech'
  s.dependency 'Capacitor'
end
