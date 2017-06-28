import { Meteor } from "meteor/meteor";
import { check, Match } from "meteor/check";
import { Factory } from "meteor/dburles:factory";
import { expect } from "meteor/practicalmeteor:chai";
import { sinon } from "meteor/practicalmeteor:sinon";
import { Reaction } from "/server/api";
import { Accounts, Shops } from "/lib/collections";
import Fixtures from "/server/imports/fixtures";
import { getUser } from "/server/imports/fixtures/users";

Fixtures();

describe.only("Group test", function () {
  let methods;
  let sandbox;
  let shop;
  let user;
  const sampleGroup = {
    name: "Shop Manager",
    permissions: ["sample-role1", "sample-role2"]
  };

  function getGroupObj(groups) {
    for (const key in groups) {
      if (groups.hasOwnProperty(key)) {
        return Object.assign({}, groups[key], { groupId: key });
      }
    }
  }

  before(function (done) {
    methods = {
      createGroup: Meteor.server.method_handlers["group/createGroup"],
      addUser: Meteor.server.method_handlers["group/addUser"]
    };
    return done();
  });

  beforeEach(function () {
    sandbox = sinon.sandbox.create();
    shop = Factory.create("shop");
    user = getUser();
    // make the same user on Meteor.users available on Accounts
    Accounts.upsert({ _id: user._id }, { $set: { userId: user._id } });
  });

  afterEach(function (done) {
    Shops.remove({});
    sandbox.restore();
    Meteor.users.remove({});
    return done();
  });

  function spyOnMethod(method, id) {
    return sandbox.stub(Meteor.server.method_handlers, `group/${method}`, function () {
      check(arguments, [Match.Any]); // to prevent audit_arguments from complaining
      this.userId = id;
      return methods[method].apply(this, arguments);
    });
  }

  it("should create a group for a particular existing shop", function () {
    sandbox.stub(Reaction, "hasPermission", () => true);
    spyOnMethod("createGroup", shop._id);

    Meteor.call("group/createGroup", sampleGroup, shop._id);
    const shopGroups = Shops.findOne({ _id: shop._id }).group;
    const group = getGroupObj(shopGroups);

    expect(group.name).to.equal(sampleGroup.name);
  });

  it("should check admin access before creating a group", function () {
    sandbox.stub(Reaction, "hasPermission", () => false);
    spyOnMethod("createGroup", shop._id);

    function createGroup() {
      return Meteor.call("group/createGroup", sampleGroup, shop._id);
    }

    expect(createGroup).to.throw(Meteor.Error, /Access Denied/);
  });

  it("should add a user to a group successfully and reference the id on the user account", function () {
    sandbox.stub(Reaction, "hasPermission", () => true);
    spyOnMethod("createGroup", shop._id);
    spyOnMethod("addUser", shop._id);

    Meteor.call("group/createGroup", sampleGroup, shop._id);

    const shopGroups = Shops.findOne({ _id: shop._id }).group;
    const group = getGroupObj(shopGroups);

    Meteor.call("group/addUser", user._id, group.groupId, shop._id);
    const updatedUser = Accounts.findOne({ _id: user._id });
    expect(updatedUser.groups[shop._id]).to.include.members([group.groupId]);
  });

  it("should add a user to a group and update user's permissions", function () {
    sandbox.stub(Reaction, "hasPermission", () => true);
    spyOnMethod("createGroup", shop._id);
    spyOnMethod("addUser", shop._id);

    Meteor.call("group/createGroup", sampleGroup, shop._id);
    const shopGroups = Shops.findOne({ _id: shop._id }).group;
    const group = getGroupObj(shopGroups);

    Meteor.call("group/addUser", user._id, group.groupId, shop._id);
    const updatedUser = Meteor.users.findOne({ _id: user._id });

    expect(updatedUser.roles[shop._id]).to.include.members(sampleGroup.permissions);
  });

  it("should remove a user from a group and update user's permissions", function () {
    sandbox.stub(Reaction, "hasPermission", () => true);
    spyOnMethod("createGroup", shop._id);
    spyOnMethod("addUser", shop._id);

    Meteor.call("group/createGroup", sampleGroup, shop._id);
    const shopGroups = Shops.findOne({ _id: shop._id }).group;
    const group = getGroupObj(shopGroups);

    Meteor.call("group/addUser", user._id, group.groupId, shop._id);
    let updatedUser = Meteor.users.findOne({ _id: user._id });

    expect(updatedUser.roles[shop._id]).to.include.members(sampleGroup.permissions);

    Meteor.call("group/removeUser", user._id, group.groupId, shop._id);
    updatedUser = Meteor.users.findOne({ _id: user._id });
    expect(updatedUser.roles[shop._id]).to.not.include.members(sampleGroup.permissions);
  });

  it("should ensure a user's permissions get updated when the group permissions changes", function () {
    sandbox.stub(Reaction, "hasPermission", () => true);
    spyOnMethod("createGroup", shop._id);
    spyOnMethod("addUser", shop._id);

    Meteor.call("group/createGroup", sampleGroup, shop._id);
    const shopGroups = Shops.findOne({ _id: shop._id }).group;
    const group = getGroupObj(shopGroups);

    Meteor.call("group/addUser", user._id, group.groupId, shop._id);
    let updatedUser = Meteor.users.findOne({ _id: user._id });

    expect(updatedUser.roles[shop._id]).to.include.members(sampleGroup.permissions);
    const newGroupData = Object.assign({}, sampleGroup, { permissions: ["new-permissions"] });

    Meteor.call("group/updateGroup", group.groupId, newGroupData, shop._id);
    updatedUser = Meteor.users.findOne({ _id: user._id });
    expect(updatedUser.roles[shop._id]).to.include.members(newGroupData.permissions);
  });
});