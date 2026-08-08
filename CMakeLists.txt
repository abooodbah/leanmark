cmake_minimum_required(VERSION 3.22)

if(CMAKE_HOST_APPLE)
  if(NOT DEFINED CMAKE_OSX_DEPLOYMENT_TARGET OR
     CMAKE_OSX_DEPLOYMENT_TARGET STREQUAL "")
    set(CMAKE_OSX_DEPLOYMENT_TARGET "12.0" CACHE STRING
        "Oldest supported macOS release" FORCE)
  endif()
endif()

file(READ "${CMAKE_CURRENT_SOURCE_DIR}/package.json" LEANMARK_PACKAGE_JSON)
string(JSON LEANMARK_MANIFEST_VERSION GET "${LEANMARK_PACKAGE_JSON}" version)

project(
  LeanMark
  VERSION "${LEANMARK_MANIFEST_VERSION}"
  DESCRIPTION "A focused offline Markdown and Mermaid reader"
  HOMEPAGE_URL "https://abooodbah.github.io/leanmark/"
  LANGUAGES C CXX)

include(CTest)
include(GNUInstallDirs)

add_library(leanmark_core STATIC
  src/core/MarkdownCore.cpp
  third_party/md4c/entity.c
  third_party/md4c/md4c.c
  third_party/md4c/md4c-html.c)
target_compile_features(leanmark_core PUBLIC cxx_std_17)
target_include_directories(leanmark_core
  PUBLIC
    "${CMAKE_CURRENT_SOURCE_DIR}/src"
  PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/third_party/md4c")

if(MSVC)
  target_compile_options(leanmark_core PRIVATE /W4 /permissive-)
else()
  target_compile_options(leanmark_core PRIVATE -Wall -Wextra -Wpedantic)
endif()

if(APPLE)
  add_subdirectory(macos)
endif()

if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  find_package(PkgConfig REQUIRED)
  pkg_check_modules(GTK4 REQUIRED IMPORTED_TARGET "gtk4>=4.10")
  pkg_check_modules(WEBKITGTK REQUIRED IMPORTED_TARGET "webkitgtk-6.0>=2.44")
  find_program(LEANMARK_NODE_EXECUTABLE NAMES node nodejs REQUIRED)

  set(LEANMARK_RUNTIME_ROOT "${CMAKE_CURRENT_BINARY_DIR}/runtime")
  set(LEANMARK_RUNTIME_ASSETS "${LEANMARK_RUNTIME_ROOT}/assets")
  set(LEANMARK_RUNTIME_STAMP "${LEANMARK_RUNTIME_ROOT}/assets.stamp")
  set(LEANMARK_ASSET_INPUTS
    assets/reader.html
    assets/reader.css
    assets/reader.js
    package.json
    package-lock.json
    scripts/stage-runtime-assets.mjs)
  list(TRANSFORM LEANMARK_ASSET_INPUTS
    PREPEND "${CMAKE_CURRENT_SOURCE_DIR}/")

  add_custom_command(
    OUTPUT "${LEANMARK_RUNTIME_STAMP}"
    COMMAND "${CMAKE_COMMAND}" -E remove_directory "${LEANMARK_RUNTIME_ASSETS}"
    COMMAND "${LEANMARK_NODE_EXECUTABLE}"
            "${CMAKE_CURRENT_SOURCE_DIR}/scripts/stage-runtime-assets.mjs"
            "${LEANMARK_RUNTIME_ASSETS}"
    COMMAND "${CMAKE_COMMAND}" -E touch "${LEANMARK_RUNTIME_STAMP}"
    DEPENDS ${LEANMARK_ASSET_INPUTS}
    WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
    COMMENT "Staging LeanMark's pinned offline reader assets"
    VERBATIM)
  add_custom_target(leanmark_runtime_assets ALL
    DEPENDS "${LEANMARK_RUNTIME_STAMP}")

  add_executable(leanmark
    src/linux/main.cpp
    src/linux/LinuxApp.cpp)
  add_dependencies(leanmark leanmark_runtime_assets)
  target_compile_features(leanmark PRIVATE cxx_std_17)
  target_compile_options(leanmark PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_definitions(leanmark PRIVATE
    "LEANMARK_INSTALL_ASSETS_DIR=\"${CMAKE_INSTALL_FULL_DATADIR}/leanmark/assets\"")
  target_link_libraries(leanmark PRIVATE
    leanmark_core
    PkgConfig::GTK4
    PkgConfig::WEBKITGTK)

  configure_file(
    packaging/linux/io.github.abooodbah.leanmark.metainfo.xml.in
    "${CMAKE_CURRENT_BINARY_DIR}/io.github.abooodbah.leanmark.metainfo.xml"
    @ONLY)

  install(TARGETS leanmark RUNTIME DESTINATION "${CMAKE_INSTALL_BINDIR}")
  install(DIRECTORY "${LEANMARK_RUNTIME_ASSETS}/"
    DESTINATION "${CMAKE_INSTALL_DATADIR}/leanmark/assets")
  install(FILES packaging/linux/io.github.abooodbah.leanmark.desktop
    DESTINATION "${CMAKE_INSTALL_DATADIR}/applications")
  install(FILES
    "${CMAKE_CURRENT_BINARY_DIR}/io.github.abooodbah.leanmark.metainfo.xml"
    DESTINATION "${CMAKE_INSTALL_DATADIR}/metainfo")
  install(FILES site/assets/leanmark-icon.png
    DESTINATION
      "${CMAKE_INSTALL_DATADIR}/icons/hicolor/256x256/apps"
    RENAME io.github.abooodbah.leanmark.png)
  install(FILES README.md LICENSE THIRD_PARTY_NOTICES.md
    DESTINATION "${CMAKE_INSTALL_DOCDIR}")

  if(BUILD_TESTING)
    add_executable(leanmark_core_tests tests/linux/CoreTests.cpp)
    target_compile_features(leanmark_core_tests PRIVATE cxx_std_17)
    target_link_libraries(leanmark_core_tests PRIVATE leanmark_core)
    add_test(NAME leanmark-core COMMAND leanmark_core_tests)

    add_test(
      NAME leanmark-linux-source-policy
      COMMAND "${LEANMARK_NODE_EXECUTABLE}"
              "${CMAKE_CURRENT_SOURCE_DIR}/tests/linux/Test-LinuxSource.mjs")

    option(
      LEANMARK_ENABLE_GUI_TESTS
      "Run the real GTK/WebKit reader smoke test under Xvfb"
      OFF)
    if(LEANMARK_ENABLE_GUI_TESTS)
      find_program(LEANMARK_XVFB_RUN_EXECUTABLE NAMES xvfb-run REQUIRED)
      add_test(
        NAME leanmark-linux-host
        COMMAND "${LEANMARK_XVFB_RUN_EXECUTABLE}" -a
                "$<TARGET_FILE:leanmark>" --smoke-test
                "${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures/simple.md")
      set_tests_properties(leanmark-linux-host PROPERTIES
        ENVIRONMENT
          "LEANMARK_ASSETS_DIR=${LEANMARK_RUNTIME_ASSETS};WEBKIT_DISABLE_COMPOSITING_MODE=1"
        TIMEOUT 30)
    endif()
  endif()

  if(CMAKE_SYSTEM_PROCESSOR MATCHES "^(x86_64|amd64|AMD64)$")
    set(LEANMARK_RELEASE_ARCHITECTURE "x86_64")
    set(CPACK_DEBIAN_PACKAGE_ARCHITECTURE "amd64")
  else()
    set(LEANMARK_RELEASE_ARCHITECTURE "${CMAKE_SYSTEM_PROCESSOR}")
  endif()

  set(CPACK_GENERATOR "DEB")
  set(CPACK_PACKAGE_NAME "LeanMark")
  set(CPACK_PACKAGE_VENDOR "LeanMark contributors")
  set(CPACK_PACKAGE_CONTACT "https://github.com/abooodbah/leanmark/issues")
  set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "${PROJECT_DESCRIPTION}")
  set(CPACK_PACKAGE_HOMEPAGE_URL "${PROJECT_HOMEPAGE_URL}")
  set(CPACK_PACKAGE_VERSION "${PROJECT_VERSION}")
  set(CPACK_PACKAGE_FILE_NAME
    "LeanMark-v${PROJECT_VERSION}-linux-${LEANMARK_RELEASE_ARCHITECTURE}")
  set(CPACK_RESOURCE_FILE_LICENSE "${CMAKE_CURRENT_SOURCE_DIR}/LICENSE")
  set(CPACK_STRIP_FILES TRUE)
  set(CPACK_DEBIAN_PACKAGE_MAINTAINER "LeanMark contributors")
  set(CPACK_DEBIAN_PACKAGE_NAME "leanmark")
  set(CPACK_DEBIAN_PACKAGE_SECTION "utils")
  set(CPACK_DEBIAN_PACKAGE_PRIORITY "optional")
  set(CPACK_DEBIAN_PACKAGE_HOMEPAGE
    "https://abooodbah.github.io/leanmark/")
  set(CPACK_DEBIAN_PACKAGE_SHLIBDEPS ON)
  set(CPACK_DEBIAN_FILE_NAME "${CPACK_PACKAGE_FILE_NAME}.deb")
  set(CPACK_INCLUDE_TOPLEVEL_DIRECTORY TRUE)
  include(CPack)
endif()
