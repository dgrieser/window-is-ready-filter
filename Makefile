UUID := $(shell sed -n 's/.*"uuid":[[:space:]]*"\([^"]*\)".*/\1/p' metadata.json)
BUILD_DIR := build
STAGE_DIR := $(BUILD_DIR)/$(UUID)
EXTENSION_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
SCHEMAS_DIR := schemas
ARCHIVE := $(BUILD_DIR)/$(UUID).zip
SRC_FILES := extension.js prefs.js metadata.json README.md

.PHONY: check clean build package install enable disable

check:
	glib-compile-schemas --strict --dry-run $(SCHEMAS_DIR)

clean:
	rm -rf $(BUILD_DIR)

build: check clean
	mkdir -p $(STAGE_DIR)/$(SCHEMAS_DIR)
	cp $(SRC_FILES) $(STAGE_DIR)/
	cp $(SCHEMAS_DIR)/*.gschema.xml $(STAGE_DIR)/$(SCHEMAS_DIR)/
	glib-compile-schemas $(STAGE_DIR)/$(SCHEMAS_DIR)

package: build
	cd $(STAGE_DIR) && zip -qr ../../$(ARCHIVE) .

install: build
	if [ -L "$(EXTENSION_DIR)" ] && [ "$$(readlink -f "$(EXTENSION_DIR)")" = "$$(readlink -f "$(CURDIR)")" ]; then rm "$(EXTENSION_DIR)"; fi
	mkdir -p $(EXTENSION_DIR)
	rsync -a --delete $(STAGE_DIR)/ $(EXTENSION_DIR)/

enable: install
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)
