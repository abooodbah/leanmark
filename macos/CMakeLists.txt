cmake_minimum_required(VERSION 3.24)

if(NOT APPLE)
  message(FATAL_ERROR "The LeanMark macOS target requires an Apple toolchain.")
endif()

set(LEANMARK_REPOSITORY_ROOT "${CMAKE_CURRENT_LIST_DIR}/..")
cmake_path(NORMAL_PATH LEANMARK_REPOSITORY_ROOT)
file(READ "${LEANMARK_REPOSITORY_ROOT}/package.json" LEANMARK_PACKAGE_JSON)
string(JSON LEANMARK_MANIFEST_VERSION GET "${LEANMARK_PACKAGE_JSON}" version)

if(NOT DEFINED CMAKE_OSX_DEPLOYMENT_TARGET OR
   CMAKE_OSX_DEPLOYMENT_TARGET STREQUAL "")
  set(CMAKE_OSX_DEPLOYMENT_TARGET "12.0" CACHE STRING
      "Oldest supported macOS release" FORCE)
endif()

project(LeanMarkMac VERSION "${LEANMARK_MANIFEST_VERSION}" LANGUAGES C CXX OBJCXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_OSX_ARCHITECTURES)
  set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING
      "Architectures included in the LeanMark app bundle")
endif()

set(LEANMARK_BUNDLE_IDENTIFIER "io.github.abooodbah.LeanMark" CACHE STRING
    "Reverse-DNS bundle identifier used by local macOS builds")
set(LEANMARK_BUILD_NUMBER "1" CACHE STRING
    "Monotonic CFBundleVersion value")

find_program(NODE_EXECUTABLE NAMES node REQUIRED)

set(LEANMARK_CORE_HEADER
    "${LEANMARK_REPOSITORY_ROOT}/src/core/MarkdownCore.h")
set(LEANMARK_CORE_SOURCE
    "${LEANMARK_REPOSITORY_ROOT}/src/core/MarkdownCore.cpp")
if(NOT EXISTS "${LEANMARK_CORE_HEADER}" OR NOT EXISTS "${LEANMARK_CORE_SOURCE}")
  message(FATAL_ERROR
      "The shared portable renderer is missing (src/core/MarkdownCore.*).")
endif()

configure_file(
  "${CMAKE_CURRENT_LIST_DIR}/Info.plist.in"
  "${CMAKE_CURRENT_BINARY_DIR}/Info.plist"
  @ONLY)

set(LEANMARK_MACOS_SOURCES
  src/main.mm
  src/LMAppDelegate.mm
  src/LMDocument.mm
  src/LMDocumentWindowController.mm
  src/LMResourceSchemeHandler.mm)
if(NOT TARGET leanmark_core)
  list(APPEND LEANMARK_MACOS_SOURCES
    "${LEANMARK_CORE_SOURCE}"
    "${LEANMARK_REPOSITORY_ROOT}/third_party/md4c/md4c.c"
    "${LEANMARK_REPOSITORY_ROOT}/third_party/md4c/md4c-html.c"
    "${LEANMARK_REPOSITORY_ROOT}/third_party/md4c/entity.c")
endif()

add_executable(LeanMark MACOSX_BUNDLE ${LEANMARK_MACOS_SOURCES})

target_include_directories(LeanMark PRIVATE
  "${LEANMARK_REPOSITORY_ROOT}/src"
  "${LEANMARK_REPOSITORY_ROOT}/third_party/md4c"
  "${CMAKE_CURRENT_LIST_DIR}/src")

target_compile_options(LeanMark PRIVATE
  $<$<COMPILE_LANGUAGE:C,CXX,OBJCXX>:-Wall>
  $<$<COMPILE_LANGUAGE:C,CXX,OBJCXX>:-Wextra>
  $<$<COMPILE_LANGUAGE:CXX,OBJCXX>:-Wpedantic>
  $<$<COMPILE_LANGUAGE:OBJCXX>:-fobjc-arc>)

target_link_libraries(LeanMark PRIVATE
  "-framework AppKit"
  "-framework WebKit")
if(TARGET leanmark_core)
  target_link_libraries(LeanMark PRIVATE leanmark_core)
endif()

set_target_properties(LeanMark PROPERTIES
  OUTPUT_NAME "LeanMark"
  MACOSX_BUNDLE TRUE
  MACOSX_BUNDLE_GUI_IDENTIFIER "${LEANMARK_BUNDLE_IDENTIFIER}"
  MACOSX_BUNDLE_INFO_PLIST "${CMAKE_CURRENT_BINARY_DIR}/Info.plist"
  XCODE_ATTRIBUTE_CLANG_ENABLE_OBJC_ARC "YES"
  XCODE_ATTRIBUTE_CODE_SIGNING_ALLOWED "NO"
  XCODE_ATTRIBUTE_CODE_SIGNING_REQUIRED "NO"
  XCODE_ATTRIBUTE_ENABLE_HARDENED_RUNTIME "YES"
  XCODE_ATTRIBUTE_MACOSX_DEPLOYMENT_TARGET "${CMAKE_OSX_DEPLOYMENT_TARGET}"
  XCODE_ATTRIBUTE_ONLY_ACTIVE_ARCH "NO")
set_property(TARGET LeanMark PROPERTY
  XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER "${LEANMARK_BUNDLE_IDENTIFIER}")

set(LEANMARK_RUNTIME_ASSETS
    "${CMAKE_CURRENT_BINARY_DIR}/runtime-assets")
set(LEANMARK_RUNTIME_ASSET_STAMP
    "${CMAKE_CURRENT_BINARY_DIR}/runtime-assets.stamp")
add_custom_command(
  OUTPUT "${LEANMARK_RUNTIME_ASSET_STAMP}"
  COMMAND "${CMAKE_COMMAND}" -E rm -rf "${LEANMARK_RUNTIME_ASSETS}"
  COMMAND "${NODE_EXECUTABLE}"
          "${LEANMARK_REPOSITORY_ROOT}/scripts/stage-runtime-assets.mjs"
          "${LEANMARK_RUNTIME_ASSETS}"
  COMMAND "${CMAKE_COMMAND}" -E touch "${LEANMARK_RUNTIME_ASSET_STAMP}"
  DEPENDS
    "${LEANMARK_REPOSITORY_ROOT}/scripts/stage-runtime-assets.mjs"
    "${LEANMARK_REPOSITORY_ROOT}/assets/reader.html"
    "${LEANMARK_REPOSITORY_ROOT}/assets/reader.css"
    "${LEANMARK_REPOSITORY_ROOT}/assets/reader.js"
    "${LEANMARK_REPOSITORY_ROOT}/package-lock.json"
  COMMENT "Staging LeanMark's pinned offline reader assets"
  VERBATIM)
add_custom_target(LeanMarkRuntimeAssets DEPENDS "${LEANMARK_RUNTIME_ASSET_STAMP}")
add_dependencies(LeanMark LeanMarkRuntimeAssets)

add_custom_command(TARGET LeanMark POST_BUILD
  COMMAND "${CMAKE_COMMAND}" -E remove_directory
          "$<TARGET_FILE_DIR:LeanMark>/../Resources"
  COMMAND "${CMAKE_COMMAND}" -E make_directory
          "$<TARGET_FILE_DIR:LeanMark>/../Resources"
  COMMAND "${CMAKE_COMMAND}" -E copy_directory
          "${LEANMARK_RUNTIME_ASSETS}"
          "$<TARGET_FILE_DIR:LeanMark>/../Resources"
  COMMAND "${CMAKE_COMMAND}" -E copy_if_different
          "${LEANMARK_REPOSITORY_ROOT}/LICENSE"
          "$<TARGET_FILE_DIR:LeanMark>/../Resources/LICENSE.txt"
  COMMAND "${CMAKE_COMMAND}" -E copy_if_different
          "${LEANMARK_REPOSITORY_ROOT}/THIRD_PARTY_NOTICES.md"
          "$<TARGET_FILE_DIR:LeanMark>/../Resources/THIRD_PARTY_NOTICES.md"
  COMMENT "Embedding offline resources and license notices"
  VERBATIM)

install(TARGETS LeanMark BUNDLE DESTINATION .)

include(CTest)
if(BUILD_TESTING)
  find_package(Python3 3.9 COMPONENTS Interpreter REQUIRED)
  add_test(
    NAME LeanMarkMacStatic
    COMMAND "${Python3_EXECUTABLE}"
            "${CMAKE_CURRENT_LIST_DIR}/tests/test_static.py"
            "${LEANMARK_REPOSITORY_ROOT}")
  add_test(
    NAME LeanMarkMacWebKitSmoke
    COMMAND "$<TARGET_FILE:LeanMark>"
            --smoke-test
            "${LEANMARK_REPOSITORY_ROOT}/tests/fixtures/simple.md")
  set_tests_properties(LeanMarkMacWebKitSmoke PROPERTIES TIMEOUT 30)
endif()

add_custom_target(package_macos
  COMMAND bash "${CMAKE_CURRENT_LIST_DIR}/scripts/package-macos.sh"
          --app "$<TARGET_BUNDLE_DIR:LeanMark>"
          --version "${PROJECT_VERSION}"
          --output "${LEANMARK_REPOSITORY_ROOT}/release"
          --sign ad-hoc
  DEPENDS LeanMark
  COMMENT "Creating an ad-hoc-signed Universal 2 preview package"
  VERBATIM)
